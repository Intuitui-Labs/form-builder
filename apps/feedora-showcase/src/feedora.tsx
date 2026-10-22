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
import { FeedoraContributionAdapter } from './adapters/FeedoraContributionAdapter';
import { FeedoraProgressAdapter } from './adapters/FeedoraProgressAdapter';
import { FeedoraRewardAdapter } from './adapters/FeedoraRewardAdapter';
import { FeedoraHttpTransportAdapter } from './adapters/FeedoraHttpTransportAdapter';
import { HmsamMeasurementAdapter } from './adapters/HmsamMeasurementAdapter';
import { LocalAuthAdapter } from './adapters/LocalAuthAdapter';
import { SupabaseAuthAdapter } from './adapters/SupabaseAuthAdapter';
import { DjangoAuthAdapter } from './adapters/DjangoAuthAdapter';
import { selectAuthPorts } from './authComposition';
import { DjangoStudioAdapter } from './adapters/DjangoStudioAdapter';
import { FEEDORA_AUTH_PROVIDER, FEEDORA_REMOTE } from './config';
import type { ContributionProfile } from './domain/types';
import { canonicalEntityId, uniqueEntities } from './domain/entities';
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

export const outboxPort = new OfflineOutboxQueue<Record<string, unknown>>({
  storageKey: 'feedora_mobile_outbox_queue',
  transport: {
    submit: async (envelope) => {
      const res = await transportPort.submitResponse(
        envelope.formId,
        envelope.values,
        {
          variant: envelope.experimentMetadata?.variantId,
          platform: 'mobile',
        },
      );
      if (!res.ok) {
        throw new Error(`Outbox submission failed with HTTP status ${res.status}`);
      }
      return {
        receiptId: String(res.responseId ?? envelope.id),
        status: 'synced',
        timestamp: new Date().toISOString(),
      };
    },
  },
});

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
  openSurvey: (uuid: string) => Promise<void>;
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

  // Auth management
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => authPort.getCurrentUser());
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
      let identity = await store.getItem('feedora_guest_identity');
      if (!identity) {
        identity = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        await store.claimGuestIdentity('guest-user', identity);
        await store.setItem('feedora_guest_identity', identity);
      }
      if (!cancelled) setGuestUserId(identity);
    };

    initializeGuestIdentity().catch(() => {
      if (!cancelled) setGuestUserId(`guest-${Date.now().toString(36)}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const signOut = useCallback(() => authPort.signOut(), []);
  const exportUserData = useCallback((format: 'json' | 'csv' | 'sql') => userDataExportPort.exportData(format), []);
  const restoreAuthSession = useCallback(() => authPort.init(), []);

  const openAuthModal = useCallback(() => setIsWelcomeOpen(true), []);
  const openAccountDrawer = useCallback(() => setAccountDrawerOpen(true), []);

  useEffect(() => {
    if (!guestUserId) return;
    let cancelled = false;
    const currentUserId = authUser?.id || guestUserId;

    (async () => {
      if (authUser && authUser.id !== guestUserId) {
        await store.claimGuestIdentity(guestUserId, String(authUser.id));
        if (!cancelled) setVersion((v) => v + 1);
      }
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
            type: (e.type || 'university') as any,
            slug: String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            accent: e.type === 'university' ? '#7A4FA8' : '#1F4D8F',
            tagline: e.userRole ? `${e.userRole} · ${e.country || 'Campus research'}` : 'Research organization',
            userRole: e.userRole,
            country: e.country,
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
          });
          const hData = await res.json();
          if (hData.ok && Array.isArray(hData.history)) {
            const seenIds = new Set(localHistory.map((h) => h.surveyId));
            for (const item of hData.history) {
              if (item.surveyUuid && !seenIds.has(item.surveyUuid)) {
                mergedHistory.push({
                  entityId: item.entityId ? canonicalEntityId(String(item.entityId)) : entityId,
                  surveyId: item.surveyUuid,
                  surveyTitle: item.surveyTitle,
                  userId: currentUserId,
                  pointsEarned: item.pointsEarned,
                  completedAt: item.completedAt,
                });
                seenIds.add(item.surveyUuid);
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
  }, [version, entityId, authUser, guestUserId]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  // Dynamic Survey selection state
  const [activeSurveyUuid, setActiveSurveyUuid] = useState<string | null>(null);
  const [activeSurveyMeta, setActiveSurveyMeta] = useState<RemoteSurveyMeta | null>(null);
  const [airDropSchema, setAirDropSchema] = useState<FormSchema | null>(null);

  const openSurvey = useCallback(async (uuid: string) => {
    try {
      const meta = await transportPort.fetchSurveyMeta(uuid);
      setAirDropSchema(null);
      setActiveSurveyUuid(uuid);
      setActiveSurveyMeta(meta);
      setVersion((v) => v + 1);
    } catch (err) {
      console.warn('Failed to fetch survey metadata:', err);
    }
  }, []);

  const openSurveyByCode = useCallback(async (code: string) => {
    try {
      const meta = await transportPort.fetchSurveyMetaByCode(code);
      setAirDropSchema(null);
      setActiveSurveyUuid(meta.survey.uuid);
      setActiveSurveyMeta(meta);
      setVersion((v) => v + 1);
      return meta;
    } catch (err) {
      console.warn('Failed to fetch survey metadata by code:', err);
      throw err;
    }
  }, []);

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
