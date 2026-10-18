import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { FEEDORA_ENTITIES, FEEDORA_FEATURES } from './fixtures/seed';
import { createStore } from './adapters/store';
import { FeedoraContributionAdapter } from './adapters/FeedoraContributionAdapter';
import { FeedoraProgressAdapter } from './adapters/FeedoraProgressAdapter';
import { FeedoraRewardAdapter } from './adapters/FeedoraRewardAdapter';
import { FeedoraHttpTransportAdapter } from './adapters/FeedoraHttpTransportAdapter';
import { HmsamMeasurementAdapter } from './adapters/HmsamMeasurementAdapter';
import { CompositeAuthAdapter } from './adapters/CompositeAuthAdapter';
import { DjangoStudioAdapter } from './adapters/DjangoStudioAdapter';
import { FEEDORA_REMOTE } from './config';
import type { ContributionProfile } from './domain/types';
import type { AuthMode, AuthUser, UserRole } from './domain/authTypes';
import type { ICreatorStudioPort } from './domain/ports/ICreatorStudioPort';


import {
  DefaultPsychometricAuditor,
  QrAirDropAdapter,
  OfflineOutboxQueue,
  type FormSchema,
} from '@intuitui-labs/form-builder-engine';

// ---------------------------------------------------------------------------
// Composition root: the app owns its adapters. The engine stays headless.
// Supports 3 live engines:
//   1. Local SQLite / In-Memory (Zero-config offline-first)
//   2. Supabase Cloud (PostgreSQL + RLS + Schema-aligned auth)
//   3. Django API (Direct HTTP to gihini-research backend)
// ---------------------------------------------------------------------------
export const store = createStore();
export const authPort = new CompositeAuthAdapter({
  store,
  djangoBaseUrl: FEEDORA_REMOTE.baseUrl,
  initialMode: 'django',
});
export const studioPort = new DjangoStudioAdapter(FEEDORA_REMOTE.baseUrl);
export const contributionPort = new FeedoraContributionAdapter(store);
export const rewardPort = new FeedoraRewardAdapter(FEEDORA_FEATURES);
export const progressPort = new FeedoraProgressAdapter();
export const measurementPort = new HmsamMeasurementAdapter();
export const transportPort = new FeedoraHttpTransportAdapter(FEEDORA_REMOTE.baseUrl);

export const psychometricAuditor = new DefaultPsychometricAuditor();
export const qrAirDropPort = new QrAirDropAdapter();
export const entities = FEEDORA_ENTITIES;

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
  joinEntity: (id: string) => Promise<void>;
  fetchEntitySurveys: (id: string) => Promise<any[]>;
  profile: ContributionProfile | null;
  contributorCounts: Record<string, number>;
  responses: Record<string, number>[];
  version: number;
  refresh: () => void;
  // Auth state & actions
  authUser: AuthUser | null;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
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
}

const FeedoraContext = createContext<FeedoraContextValue | null>(null);

export function FeedoraProvider({ children }: { children: ReactNode }) {
  const [entitiesList, setEntitiesList] = useState(FEEDORA_ENTITIES);
  const [entityId, setEntityId] = useState(entities[0]!.id);
  const [profile, setProfile] = useState<ContributionProfile | null>(null);
  const [contributorCounts, setContributorCounts] = useState<Record<string, number>>({});
  const [responses, setResponses] = useState<Record<string, number>[]>([]);
  const [version, setVersion] = useState(0);

  // Auth management
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => authPort.getCurrentUser());
  const [authMode, setAuthModeState] = useState<AuthMode>(() => authPort.mode);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isAccountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(() => !authPort.getCurrentUser());
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);

  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);
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
    // Bootstrap auth session from server cookie
    authPort.init();

    // Listen to auth changes
    const unsubAuth = authPort.onAuthStateChange((user) => {
      setAuthUser(user);
      setAuthModeState(authPort.mode);
      if (user?.organizationId) {
        setEntityId(user.organizationId);
      }
      setVersion((v) => v + 1);
    });

    const unsubData = subscribeDataChanged(() => setVersion((v) => v + 1));

    return () => {
      unsubAuth();
      unsubData();
    };
  }, []);

  const setAuthMode = useCallback((mode: AuthMode) => {
    authPort.setMode(mode);
    setAuthModeState(mode);
    setAuthUser(authPort.getCurrentUser());
    setVersion((v) => v + 1);
  }, []);

  const openAuthModal = useCallback(() => setAuthModalOpen(true), []);
  const openAccountDrawer = useCallback(() => setAccountDrawerOpen(true), []);

  useEffect(() => {
    let cancelled = false;
    const currentUserId = authUser?.id || 'guest-user';
    const currentName = authUser?.displayName || 'Contributor';
    const currentAvatar = authUser?.avatar || '🎙️';

    contributionPort
      .join(currentUserId, currentName, currentAvatar, entityId, authUser?.totalPoints ?? 0)
      .then((joined) => {
        if (!cancelled) setProfile(joined);
      });

    // Fetch live entities from Django when in django mode
    if (authMode === 'django') {
      fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/`, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.ok || !Array.isArray(data.entities)) return;
          const liveEntities = data.entities.map((e: any) => ({
            id: String(e.entityId || `org-${e.id}`),
            name: String(e.name),
            type: (e.type || 'university') as any,
            slug: String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            accent: e.type === 'university' ? '#7A4FA8' : '#1F4D8F',
            tagline: e.userRole ? `${e.userRole} · ${e.country || 'Campus research'}` : 'Research organization',
            userRole: e.userRole,
            country: e.country,
          }));
          if (liveEntities.length > 0) {
            setEntitiesList(liveEntities);
          }
        })
        .catch(() => {});
    }

    // Automatically claim & migrate points and form history earned as guest when user signs in
    if (authUser && authUser.id !== 'guest-user') {
      (async () => {
        const guestProfile = await contributionPort.getProfile('guest-user', entityId);
        if (guestProfile && guestProfile.totalPoints > 0) {
          const userProf = await contributionPort.getProfile(authUser.id, entityId);
          if (userProf) {
            userProf.totalPoints += guestProfile.totalPoints;
            userProf.surveysCompleted += guestProfile.surveysCompleted;
            userProf.standing = contributionPort.standingFor(userProf.totalPoints);
            await store.putProfile(userProf);
          }
          guestProfile.totalPoints = 0;
          guestProfile.surveysCompleted = 0;
          guestProfile.standing = contributionPort.standingFor(0);
          await store.putProfile(guestProfile);
          if ('reassignUserHistory' in store) {
            await (store as any).reassignUserHistory('guest-user', String(authUser.id));
          }
          if (!cancelled) {
            setVersion((v) => v + 1);
          }
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [entityId, authUser, authMode]);

  useEffect(() => {
    let cancelled = false;
    const currentUserId = authUser?.id || 'guest-user';

    (async () => {
      const counts: Record<string, number> = {};
      for (const entity of entities) {
        counts[entity.id] = (await contributionPort.listContributors(entity.id)).length;
      }
      const loadedResponses = await store.listResponses();
      const refreshedProfile = await contributionPort.getProfile(currentUserId, entityId);

      if (cancelled) return;
      setContributorCounts(counts);
      setResponses(loadedResponses);
      if (refreshedProfile) {
        if (authUser?.totalPoints && authUser.totalPoints > refreshedProfile.totalPoints) {
          refreshedProfile.totalPoints = authUser.totalPoints;
          refreshedProfile.standing = contributionPort.standingFor(authUser.totalPoints);
        }
        setProfile(refreshedProfile);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, entityId, authUser]);

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
      setEntityId(targetEntityId);
      if (authMode === 'django' && authUser) {
        const numericId = targetEntityId.replace('org-', '');
        try {
          await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/entities/${numericId}/join/`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch {
          // offline/local fallback
        }
      }
      setVersion((v) => v + 1);
    },
    [authMode, authUser],
  );

  const fetchEntitySurveys = useCallback(
    async (targetEntityId: string): Promise<any[]> => {
      if (authMode === 'django') {
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
      }
      return [];
    },
    [authMode],
  );

  return (
    <FeedoraContext.Provider
      value={{
        entityId,
        setEntityId,
        entitiesList,
        joinEntity,
        fetchEntitySurveys,
        profile,
        contributorCounts,
        responses,
        version,
        refresh,
        authUser,
        authMode,
        setAuthMode,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
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
      }}
    >
      {children}
    </FeedoraContext.Provider>
  );
}

export function useFeedora(): FeedoraContextValue {
  const context = useContext(FeedoraContext);
  if (!context) {
    throw new Error('useFeedora must be used inside <FeedoraProvider>');
  }
  return context;
}
