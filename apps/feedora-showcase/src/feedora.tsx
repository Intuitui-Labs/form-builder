import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { FEEDORA_ENTITIES, FEEDORA_FEATURES } from './fixtures/seed';
import { createStore } from './adapters/store';
import { feedoraOutboxStorageKey, migrateLegacyFeedoraOutbox, transferFeedoraOutboxScope } from './adapters/FeedoraOutboxStorage';
import { FeedoraContributionAdapter } from './adapters/FeedoraContributionAdapter';
import { FeedoraProgressAdapter } from './adapters/FeedoraProgressAdapter';
import { FeedoraRewardAdapter } from './adapters/FeedoraRewardAdapter';
import { FeedoraHttpTransportAdapter } from './adapters/FeedoraHttpTransportAdapter';
import { HmsamMeasurementAdapter } from './adapters/HmsamMeasurementAdapter';
import { LocalAuthAdapter } from './adapters/LocalAuthAdapter';
import { SupabaseAuthAdapter } from './adapters/SupabaseAuthAdapter';
import { DjangoAuthAdapter } from './adapters/DjangoAuthAdapter';
import { getGuestCredential, setGuestCredential } from './adapters/guestCredentialStore';
import { selectAuthPorts } from './authComposition';
import { DjangoStudioAdapter } from './adapters/DjangoStudioAdapter';
import { FEEDORA_AUTH_PROVIDER, FEEDORA_REMOTE } from './config';
import type { ContributionProfile } from './domain/types';
import { profileUserIdFromReceipt, recordRemoteSubmissionReceipt } from './domain/recordRemoteSubmissionReceipt';
import { scopeRefFromWire } from './domain/identity';
import { canonicalEntityId, uniqueEntities } from './domain/entities';
import { prepareSurveyForParticipation } from './domain/prepareSurveyForParticipation';
import type {
  AuthUser,
  ExportDataPayload,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
  UserRole,
} from './domain/authTypes';
import type { ICreatorStudioPort } from './domain/ports/ICreatorStudioPort';


import {
  DefaultPsychometricAuditor,
  QrAirDropAdapter,
  OfflineOutboxQueue,
  type FormSchema,
} from '@intuitui-labs/form-builder-engine';

// ---------------------------------------------------------------------------
// Composition root: the app owns its adapters. The engine stays headless.
// One configured identity provider is selected here; research transport remains independent.
// ---------------------------------------------------------------------------
export const store = createStore();
const { identity: authPort, dataExport: userDataExportPort } = selectAuthPorts(FEEDORA_AUTH_PROVIDER, {
  local: () => Object.assign(new LocalAuthAdapter(store), { mode: 'local' as const }),
  supabase: () => Object.assign(new SupabaseAuthAdapter(), { mode: 'supabase' as const }),
  django: () => Object.assign(new DjangoAuthAdapter(FEEDORA_REMOTE.baseUrl), { mode: 'django' as const }),
});
export const studioPort = new DjangoStudioAdapter(FEEDORA_REMOTE.baseUrl);
export const contributionPort = new FeedoraContributionAdapter(store);
export const rewardPort = new FeedoraRewardAdapter(FEEDORA_FEATURES);
export const progressPort = new FeedoraProgressAdapter();
export const measurementPort = new HmsamMeasurementAdapter();
export const transportPort = new FeedoraHttpTransportAdapter(FEEDORA_REMOTE.baseUrl);

export const psychometricAuditor = new DefaultPsychometricAuditor();
export const qrAirDropPort = new QrAirDropAdapter();
export const entities = uniqueEntities(FEEDORA_ENTITIES);

async function requestGuestSession(): Promise<{ identity: string; token: string }> {
  const response = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/guest/session/`, { method: 'POST' });
  if (!response.ok) throw new Error('Guest session unavailable');
  const data = await response.json();
  if (!data.guestParticipantId || !data.guestToken) throw new Error('Invalid guest session response');
  return { identity: String(data.guestParticipantId), token: String(data.guestToken) };
}

function createAttemptUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (marker) => {
    const random = Math.floor(Math.random() * 16);
    return (marker === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function createFeedoraOutbox(ownerKey: string): OfflineOutboxQueue<Record<string, unknown>> {
  return new OfflineOutboxQueue<Record<string, unknown>>({
  storage: store,
  storageKey: feedoraOutboxStorageKey(ownerKey),
  autoFlushOnReconnect: false,
  transport: {
    submit: async (envelope) => {
      const res = await transportPort.submitResponse(
        envelope.formId,
        envelope.values,
        {
          variant: envelope.context?.variant ?? envelope.experimentMetadata?.variantId,
          platform: envelope.context?.platform ?? 'mobile',
          durationMs: envelope.context?.durationMs,
          dwellMs: envelope.context?.dwellMs,
          qualityFlags: envelope.context?.qualityFlags,
          consentVersion: envelope.context?.consentVersion,
          submissionId: envelope.id,
          principalId: envelope.context?.principalId,
          scope: scopeRefFromWire(
            envelope.context?.scopeId === 'platform' ? 'platform' : 'organization',
            envelope.context?.scopeId ?? envelope.tenantId,
          ) ?? undefined,
          scopeId: envelope.context?.scopeId ?? envelope.tenantId,
          policyVersion: envelope.context?.policyVersion,
          attemptId: envelope.context?.transportMetadata?.attemptId,
          guestParticipantId: envelope.context?.guestParticipantId,
        },
      );
      if (!res.ok) {
        const error = new Error(res.error || `Outbox submission failed with HTTP status ${res.status}`);
        Object.assign(error, {
          status: res.status,
          code: res.code,
          retryable: res.status === 0 || res.status >= 500 || res.code === 'guest_session_required',
        });
        throw error;
      }
      return {
        receiptId: String(res.responseId ?? envelope.id),
        status: 'accepted',
        timestamp: new Date().toISOString(),
        metadata: res as unknown as Record<string, unknown>,
      };
    },
  },
  onReceipt: async (envelope, receipt) => {
    const result = receipt.metadata as import('./domain/ports/transportTypes').RemoteSubmitResult | undefined;
    const context = envelope.context;
    if (!context || !result?.responseId || !result.pointsEarned && result.pointsEarned !== 0) return;
    const attemptStorageKey = context.transportMetadata?.attemptStorageKey;
    if (attemptStorageKey) {
      await store.removeItem(attemptStorageKey);
    }
    const canonicalUserId = profileUserIdFromReceipt(result, context.profileUserId);
    const canonicalPrincipalId = result.user?.id !== undefined ? `user-${result.user.id}` : context.principalId;
    await recordRemoteSubmissionReceipt(contributionPort, {
      submissionId: envelope.id,
      responseId: String(result.responseId),
      principalId: canonicalPrincipalId,
      userId: canonicalUserId,
      scopeId: result.scopeId ?? context.scopeId,
      surveyId: context.surveyId,
      surveyTitle: context.surveyTitle ?? context.surveyId,
      displayName: context.displayName,
      avatar: context.avatar,
      points: result.pointsEarned,
      completedAt: result.acceptedAt ?? new Date().toISOString(),
    });
    notifyDataChanged();
  },
  });
}

// Tiny change bus so the three screens stay in sync without a global store.
const listeners = new Set<() => void>();
export function subscribeDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyDataChanged(): void {
  for (const listener of listeners) listener();
}

import type { RemoteSurveyMeta } from './domain/ports/transportTypes';

interface FeedoraContextValue {
  entityId: string;
  setEntityId: (id: string) => void;
  entitiesList: typeof FEEDORA_ENTITIES;
  membershipIds: string[];
  joinEntity: (id: string) => Promise<void>;
  fetchEntitySurveys: (id: string) => Promise<any[]>;
  profile: ContributionProfile | null;
  contributorCounts: Record<string, number>;
  responses: Record<string, number>[];
  version: number;
  refresh: () => void;
  // Auth state & actions
  authUser: AuthUser | null;
  guestUserId: string;
  guestToken: string | null;
  signIn: (input: SignInInput) => Promise<AuthUser>;
  signUpRespondent: (input: SignUpRespondentInput) => Promise<AuthUser>;
  signUpCreator: (input: SignUpCreatorInput) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  exportUserData: (format: 'json' | 'csv' | 'sql') => Promise<ExportDataPayload>;
  restoreAuthSession: () => Promise<AuthUser | null>;
  openAuthModal: () => void;
  isAccountDrawerOpen: boolean;
  openAccountDrawer: () => void;
  closeAccountDrawer: () => void;
  studioPort: ICreatorStudioPort;
  // Role & Preview Mode
  previewRole: UserRole | null;
  switchPreviewRole: (role: UserRole | null) => void;
  effectiveRole: UserRole;
  isWelcomeOpen: boolean;
  openWelcome: () => void;
  closeWelcome: () => void;
  // Dynamic Survey Selection
  activeSurveyUuid: string | null;
  activeSurveyMeta: RemoteSurveyMeta | null;
  airDropSchema: FormSchema | null;
  openSurvey: (uuid: string, options?: { confirmPolicyChange?: boolean }) => Promise<RemoteSurveyMeta>;
  openSurveyByCode: (code: string) => Promise<RemoteSurveyMeta>;
  openAirDropSurvey: (schema: FormSchema) => void;
  resetToDefaultSurvey: () => void;
  outboxPort: OfflineOutboxQueue<Record<string, unknown>>;
  submissionHistory: import('./domain/ports/IEntityStore').SubmissionHistoryRecord[];
}

const FeedoraContext = createContext<FeedoraContextValue | null>(null);

export function FeedoraProvider({ children }: { children: ReactNode }) {
  const [entitiesList, setEntitiesList] = useState(entities);
  const [membershipIds, setMembershipIds] = useState<string[]>([]);
  const [entityId, setEntityId] = useState(entities[0]!.id);
  const [profile, setProfile] = useState<ContributionProfile | null>(null);
  const [contributorCounts, setContributorCounts] = useState<Record<string, number>>({});
  const [responses, setResponses] = useState<Record<string, number>[]>([]);
  const [submissionHistory, setSubmissionHistory] = useState<import('./domain/ports/IEntityStore').SubmissionHistoryRecord[]>([]);
  const [version, setVersion] = useState(0);
  const [selectionHydratedFor, setSelectionHydratedFor] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);

  // Auth management
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => authPort.getCurrentUser());
  const outboxOwnerKey = authUser ? `user:${authUser.id}` : `guest:${guestUserId ?? 'guest-user'}`;
  const outboxPort = useMemo(() => createFeedoraOutbox(outboxOwnerKey), [outboxOwnerKey]);
  const [isAccountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(() => !authPort.getCurrentUser());
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const selectionOwnerId = authUser?.id ?? guestUserId ?? 'guest-user';

  const closeAccountDrawer = useCallback(() => setAccountDrawerOpen(false), []);

  const effectiveRole: UserRole = useMemo(() => {
    if (authUser?.role === 'creator') {
      return previewRole === 'respondent' ? 'respondent' : 'creator';
    }
    return 'respondent';
  }, [authUser, previewRole]);

  const switchPreviewRole = useCallback((newRole: UserRole | null) => {
    if (authUser?.role === 'creator') {
      setPreviewRole(newRole);
      setVersion((v) => v + 1);
    }
  }, [authUser]);

  const openWelcome = useCallback(() => setIsWelcomeOpen(true), []);
  const closeWelcome = useCallback(() => setIsWelcomeOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    const initializeGuestIdentity = async () => {
      // Migrate the old shared queue before the app can accept a new response.
      await migrateLegacyFeedoraOutbox(store);
      const savedIdentity = await store.getItem('feedora_guest_identity');
      let savedToken = await getGuestCredential();
      if (!savedToken) {
        // Migrate the first server credential from the previous SQLite/KV storage.
        savedToken = await store.getItem('feedora_guest_token');
        if (savedToken) {
          try {
            await setGuestCredential(savedToken);
            await store.removeItem('feedora_guest_token');
          } catch {
            // Keep using the prior value for this run if platform credential storage is temporarily unavailable.
          }
        }
      }
      if (savedIdentity && savedToken) {
        transportPort.setGuestToken(savedToken);
        if (!cancelled) { setGuestUserId(savedIdentity); setGuestToken(savedToken); }
        return;
      }
      try {
        const { identity, token } = await requestGuestSession();
        if (savedIdentity && savedIdentity !== identity) {
          await store.claimGuestIdentity(savedIdentity, identity);
          await transferFeedoraOutboxScope(store, `guest:${savedIdentity}`, `guest:${identity}`);
        }
        await store.setItem('feedora_guest_identity', identity);
        try { await setGuestCredential(token); } catch {
          console.warn('Guest session is active for this run but could not be saved to platform credential storage.');
        }
        transportPort.setGuestToken(token);
        if (!cancelled) { setGuestUserId(identity); setGuestToken(token); }
      } catch {
        const identity = savedIdentity || `guest-local-${Date.now().toString(36)}`;
        await store.setItem('feedora_guest_identity', identity);
        if (!cancelled) setGuestUserId(identity);
      }
    };

    initializeGuestIdentity().catch(() => {
      if (!cancelled) setGuestUserId(`guest-${Date.now().toString(36)}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!guestUserId || guestToken || authUser) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void requestGuestSession().then(async ({ identity, token }) => {
        if (guestUserId !== identity) {
          await store.claimGuestIdentity(guestUserId, identity);
          await transferFeedoraOutboxScope(store, `guest:${guestUserId}`, `guest:${identity}`);
        }
        await store.setItem('feedora_guest_identity', identity);
        try { await setGuestCredential(token); } catch {
          console.warn('Guest session is active for this run but could not be saved to platform credential storage.');
        }
        transportPort.setGuestToken(token);
        if (!cancelled) { setGuestUserId(identity); setGuestToken(token); }
      }).catch(() => {});
    }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [guestUserId, guestToken, authUser?.id]);

  useEffect(() => {
    if (!guestToken || !authUser) return;
    let cancelled = false;
    void (async () => {
      const claimedKey = `feedora_guest_claimed:${guestUserId}:${authUser.id}`;
      if (await store.getItem(claimedKey)) return;
      const response = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/guest/claim/`, {
        method: 'POST', credentials: 'include',
        headers: { 'X-Feedora-Guest-Token': guestToken },
      });
      if (!response.ok) throw new Error('Guest progress claim failed');
      if (guestUserId) await transferFeedoraOutboxScope(store, `guest:${guestUserId}`, `user:${authUser.id}`);
      await store.claimGuestIdentity(guestUserId ?? '', String(authUser.id));
      await store.setItem(claimedKey, '1');
      if (!cancelled) setVersion((v) => v + 1);
    })().catch((error) => console.warn('Could not attach guest progress to account:', error));
    return () => { cancelled = true; };
  }, [authUser?.id, guestToken, guestUserId]);

  useEffect(() => () => outboxPort.destroy(), [outboxPort]);

  useEffect(() => {
    // Bootstrap auth session from server cookie
    void authPort.init().catch((error) => {
      console.warn('Failed to restore the configured identity session:', error);
    });

    // Listen to auth changes
    const unsubAuth = authPort.onAuthStateChange((user) => {
      setAuthUser(user);
      setVersion((v) => v + 1);
    });

    const unsubData = subscribeDataChanged(() => setVersion((v) => v + 1));

    return () => {
      unsubAuth();
      unsubData();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    store.getItem(`feedora:selected-entity:${selectionOwnerId}`)
      .then((savedEntityId) => {
        if (cancelled) return;
        if (savedEntityId) setEntityId(canonicalEntityId(savedEntityId));
        setSelectionHydratedFor(selectionOwnerId);
      })
      .catch(() => {
        if (!cancelled) setSelectionHydratedFor(selectionOwnerId);
      });
    return () => {
      cancelled = true;
    };
  }, [guestUserId, selectionOwnerId]);

  useEffect(() => {
    if (!guestUserId) return;
    if (selectionHydratedFor !== selectionOwnerId) return;
    void store.setItem(`feedora:selected-entity:${selectionOwnerId}`, entityId);
  }, [entityId, guestUserId, selectionHydratedFor, selectionOwnerId]);

  const signIn = useCallback((input: SignInInput) => authPort.signIn(input), []);
  const signUpRespondent = useCallback((input: SignUpRespondentInput) => authPort.signUpRespondent(input), []);
  const signUpCreator = useCallback((input: SignUpCreatorInput) => authPort.signUpCreator(input), []);
  const signOut = useCallback(async () => {
    await authPort.signOut();
    try {
      const { identity, token } = await requestGuestSession();
      await store.setItem('feedora_guest_identity', identity);
      try { await setGuestCredential(token); } catch {
        console.warn('The new guest session could not be saved to platform credential storage.');
      }
      transportPort.setGuestToken(token);
      setGuestUserId(identity);
      setGuestToken(token);
    } catch {
      transportPort.setGuestToken(null);
      setGuestToken(null);
    }
  }, []);
  const exportUserData = useCallback((format: 'json' | 'csv' | 'sql') => userDataExportPort.exportData(format), []);
  const restoreAuthSession = useCallback(() => authPort.init(), []);

  const openAuthModal = useCallback(() => setIsWelcomeOpen(true), []);
  const openAccountDrawer = useCallback(() => setAccountDrawerOpen(true), []);

  useEffect(() => {
    if (!guestUserId) return;
    let cancelled = false;
    const currentUserId = authUser?.id || guestUserId;

    (async () => {
      const existing = await contributionPort.getProfile(currentUserId, entityId);
      if (!cancelled) setProfile(existing);
    })().catch((error) => {
      console.warn('Failed to initialize organization profile:', error);
    });

    // Public organization catalog uses the research API, independent of identity.
    fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/`, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.ok || !Array.isArray(data.entities)) return;
          const liveEntities = uniqueEntities(data.entities.map((e: any) => ({
            id: canonicalEntityId(String(e.entityId || `org-${e.id}`)),
            name: String(e.name),
            type: (e.scopeKind === 'platform' ? 'platform' : e.type || 'university') as any,
            scopeKind: e.scopeKind === 'platform' ? 'platform' : 'organization',
            slug: String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            accent: e.scopeKind === 'platform' ? '#14140f' : e.type === 'university' ? '#7A4FA8' : '#1F4D8F',
            tagline: e.scopeKind === 'platform' ? 'Platform-wide research and standing' : e.userRole ? `${e.userRole} · ${e.country || 'Campus research'}` : 'Research organization',
            userRole: e.userRole,
            country: e.country,
            canManageAggregateSharing: Boolean(e.canManageAggregateSharing),
            aggregateStatsSharingEnabled: Boolean(e.aggregateStatsSharingEnabled),
          })));
          if (liveEntities.length > 0) {
            setEntitiesList(liveEntities);
          }
        })
        .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [entityId, authUser, guestUserId]);

  useEffect(() => {
    let cancelled = false;
    if (!authUser || authUser.id === 'guest-user') {
      setMembershipIds([]);
      return () => {
        cancelled = true;
      };
    }

    fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/mine/`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Organization catalog failed with HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.ok && Array.isArray(data.entities)) {
          setMembershipIds(data.entities.map((item: { entityId: string }) => canonicalEntityId(item.entityId)));
        }
      })
      .catch(() => {
        if (!cancelled) setMembershipIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  useEffect(() => {
    if (!guestUserId) return;
    let cancelled = false;
    const currentUserId = authUser?.id || guestUserId;

    (async () => {
      const counts: Record<string, number> = {};
      for (const entity of entities) {
        counts[entity.id] = (await contributionPort.listContributors(entity.id)).length;
      }
      const loadedResponses = await store.listResponses();
      let refreshedProfile = await contributionPort.getProfile(currentUserId, entityId);
      if (authUser) {
        try {
          const leaderboard = await transportPort.fetchLeaderboard(entityId);
          const remoteProfile = leaderboard.contributors.find(
            (item) => item.userId === `user-${authUser.id}`,
          );
          if (remoteProfile) {
            refreshedProfile = {
              ...remoteProfile,
              updatedAt: new Date().toISOString(),
            };
          }
        } catch {
          // Keep locally persisted, completed offline progress available.
        }
      }
      const localHistory = await store.listUserHistory(currentUserId);

      // The configured Django identity uses its own server session cookie.
      let mergedHistory = [...localHistory];
      if (authUser) {
        try {
          const res = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/respondent/history/`, {
            credentials: 'include',
            headers: guestToken ? { 'X-Feedora-Guest-Token': guestToken } : {},
          });
          const hData = await res.json();
          if (hData.ok && Array.isArray(hData.history)) {
            const seenIds = new Set(localHistory.map((h) => h.responseId ? `response:${h.responseId}` : h.submissionId ? `submission:${h.submissionId}` : ''));
            for (const item of hData.history) {
              const historyKey = item.responseId ? `response:${item.responseId}` : item.submissionId ? `submission:${item.submissionId}` : '';
              if (item.surveyUuid && historyKey && !seenIds.has(historyKey)) {
                mergedHistory.push({
                  entityId: item.entityId ? canonicalEntityId(String(item.entityId)) : entityId,
                  surveyId: item.surveyUuid,
                  surveyTitle: item.surveyTitle,
                  userId: currentUserId,
                  pointsEarned: item.pointsEarned,
                  completedAt: item.completedAt,
                  responseId: String(item.responseId),
                  submissionId: item.submissionId,
                });
                seenIds.add(historyKey);
              }
            }
          }
        } catch {
          // offline fallback
        }
      }

      if (cancelled) return;
      setContributorCounts(counts);
      setResponses(loadedResponses);
      setSubmissionHistory(mergedHistory);
      if (refreshedProfile) {
        setProfile(refreshedProfile);
      } else {
        setProfile(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, entityId, authUser, guestUserId, guestToken]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  // Dynamic Survey selection state
  const [activeSurveyUuid, setActiveSurveyUuid] = useState<string | null>(null);
  const [activeSurveyMeta, setActiveSurveyMeta] = useState<RemoteSurveyMeta | null>(null);
  const [airDropSchema, setAirDropSchema] = useState<FormSchema | null>(null);

  const openSurvey = useCallback(async (uuid: string, options?: { confirmPolicyChange?: boolean }) => {
    const owner = authUser ? `user-${authUser.id}` : `guest-${guestUserId || 'unknown'}`;
    const scopeId = entityId;
    let meta: RemoteSurveyMeta;
    try {
      meta = await transportPort.fetchSurveyMeta(uuid);
    } catch (error) {
      const cached = await store.getItem(`feedora:survey-meta:v1:${uuid}`);
      if (!cached) throw error;
      meta = JSON.parse(cached) as RemoteSurveyMeta;
    }
    meta = await prepareSurveyForParticipation(uuid, meta, owner, scopeId, {
      store,
      transport: transportPort,
      createAttemptId: createAttemptUuid,
      confirmPolicyChange: options?.confirmPolicyChange,
    });
    setAirDropSchema(null);
    setActiveSurveyUuid(uuid);
    setActiveSurveyMeta(meta);
    setVersion((v) => v + 1);
    return meta;
  }, [authUser, entityId, guestUserId]);

  const openSurveyByCode = useCallback(async (code: string) => {
    const owner = authUser ? `user-${authUser.id}` : `guest-${guestUserId || 'unknown'}`;
    const meta = await transportPort.fetchSurveyMetaByCode(code);
    const prepared = await prepareSurveyForParticipation(meta.survey.uuid, meta, owner, entityId, {
      store,
      transport: transportPort,
      createAttemptId: createAttemptUuid,
    });
    setAirDropSchema(null);
    setActiveSurveyUuid(prepared.survey.uuid);
    setActiveSurveyMeta(prepared);
    setVersion((v) => v + 1);
    return prepared;
  }, [authUser, entityId, guestUserId]);

  const openAirDropSurvey = useCallback((schema: FormSchema) => {
    setAirDropSchema(schema);
    setActiveSurveyUuid(schema.id);
    setActiveSurveyMeta({
      survey: {
        id: 9999,
        uuid: schema.id,
        title: schema.title,
        description: schema.description || '',
        is_hmsam: true,
        access_code: 'AIRDROP',
      },
      features: {},
      questions: [],
    });
    setVersion((v) => v + 1);
  }, []);

  const resetToDefaultSurvey = useCallback(() => {
    setActiveSurveyUuid(null);
    setActiveSurveyMeta(null);
    setAirDropSchema(null);
    setVersion((v) => v + 1);
  }, []);

  const joinEntity = useCallback(
    async (targetEntityId: string) => {
      const selectedEntityId = canonicalEntityId(targetEntityId);
      setEntityId(selectedEntityId);
      await store.setItem(`feedora:selected-entity:${selectionOwnerId}`, selectedEntityId);
      if (authUser && /^org-\d+$/.test(selectedEntityId)) {
        const numericId = selectedEntityId.replace('org-', '');
        try {
          const response = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/${numericId}/join/`, {
            method: 'POST',
            credentials: 'include',
          });
          if (response.ok) {
            setMembershipIds((current) => current.includes(selectedEntityId)
              ? current
              : [...current, selectedEntityId]);
          }
        } catch {
          // offline/local fallback
        }
      }
      setVersion((v) => v + 1);
    },
    [authUser, selectionOwnerId],
  );

  const fetchEntitySurveys = useCallback(
    async (targetEntityId: string): Promise<any[]> => {
      if (targetEntityId === 'platform') {
        return transportPort.fetchPublicSurveys('platform');
      }
      const numericId = targetEntityId.replace('org-', '');
        try {
          const res = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/${numericId}/surveys/`, {
            credentials: 'include',
          });
          const data = await res.json();
          if (data.ok && Array.isArray(data.surveys)) {
            return data.surveys;
          }
        } catch {
          // offline fallback
        }
      return [];
    },
    [],
  );

  return (
    <FeedoraContext.Provider
      value={{
        entityId,
        setEntityId,
        entitiesList,
        membershipIds,
        joinEntity,
        fetchEntitySurveys,
        profile,
        contributorCounts,
        responses,
        version,
        refresh,
        authUser,
        guestUserId: guestUserId ?? 'guest-user',
        guestToken,
        signIn,
        signUpRespondent,
        signUpCreator,
        signOut,
        exportUserData,
        restoreAuthSession,
        openAuthModal,
        isAccountDrawerOpen,
        openAccountDrawer,
        closeAccountDrawer,
        previewRole,
        switchPreviewRole,
        effectiveRole,
        isWelcomeOpen,
        openWelcome,
        closeWelcome,
        studioPort,
        activeSurveyUuid,
        activeSurveyMeta,
        airDropSchema,
        openSurvey,
        openSurveyByCode,
        openAirDropSurvey,
        resetToDefaultSurvey,
        outboxPort,
        submissionHistory,
      }}
    >
      {guestUserId ? children : <StartupScreen />}
    </FeedoraContext.Provider>
  );
}

function StartupScreen() {
  return (
    <View style={startupStyles.container}>
      <ActivityIndicator color="#1F4D8F" size="large" />
      <Text style={startupStyles.title}>Starting Feedora</Text>
      <Text style={startupStyles.message}>Loading your saved progress…</Text>
    </View>
  );
}

const startupStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F5F0',
    gap: 12,
    padding: 24,
  },
  title: {
    color: '#172033',
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    color: '#687386',
    fontSize: 14,
  },
});

export function useFeedora(): FeedoraContextValue {
  const context = useContext(FeedoraContext);
  if (!context) {
    throw new Error('useFeedora must be used inside <FeedoraProvider>');
  }
  return context;
}
