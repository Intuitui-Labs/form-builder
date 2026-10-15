import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { FEEDORA_REMOTE } from './config';
import type { ContributionProfile } from './domain/types';
import type { AuthMode, AuthUser } from './domain/authTypes';
import { AuthModal } from './components/AuthModal';
import { AccountDrawer } from './components/AccountDrawer';

// ---------------------------------------------------------------------------
// Composition root: the app owns its adapters. The engine stays headless.
// Supports 3 live engines:
//   1. Local SQLite / In-Memory (Zero-config offline-first)
//   2. Supabase Cloud (PostgreSQL + RLS + Schema-aligned auth)
//   3. Django API (Direct HTTP to gihini-research backend)
// ---------------------------------------------------------------------------
export const store = createStore();
export const authPort = new CompositeAuthAdapter({ store });
export const contributionPort = new FeedoraContributionAdapter(store);
export const rewardPort = new FeedoraRewardAdapter(FEEDORA_FEATURES);
export const progressPort = new FeedoraProgressAdapter();
export const measurementPort = new HmsamMeasurementAdapter();
export const transportPort = new FeedoraHttpTransportAdapter(FEEDORA_REMOTE.baseUrl);
export const entities = FEEDORA_ENTITIES;

// Tiny change bus so the three screens stay in sync without a global store.
const listeners = new Set<() => void>();
export function subscribeDataChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyDataChanged(): void {
  for (const listener of listeners) listener();
}

interface FeedoraContextValue {
  entityId: string;
  setEntityId: (id: string) => void;
  profile: ContributionProfile | null;
  contributorCounts: Record<string, number>;
  responses: Record<string, number>[];
  version: number;
  refresh: () => void;
  // Auth state & actions
  authUser: AuthUser | null;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  openAuthModal: () => void;
  openAccountDrawer: () => void;
}

const FeedoraContext = createContext<FeedoraContextValue | null>(null);

export function FeedoraProvider({ children }: { children: ReactNode }) {
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

  useEffect(() => {
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
      .join(currentUserId, currentName, currentAvatar, entityId)
      .then((joined) => {
        if (!cancelled) setProfile(joined);
      });

    return () => {
      cancelled = true;
    };
  }, [entityId, authUser]);

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
      if (refreshedProfile) setProfile(refreshedProfile);
    })();

    return () => {
      cancelled = true;
    };
  }, [version, entityId, authUser]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return (
    <FeedoraContext.Provider
      value={{
        entityId,
        setEntityId,
        profile,
        contributorCounts,
        responses,
        version,
        refresh,
        authUser,
        authMode,
        setAuthMode,
        openAuthModal,
        openAccountDrawer,
      }}
    >
      {children}
      <AuthModal visible={isAuthModalOpen} onClose={() => setAuthModalOpen(false)} />
      <AccountDrawer
        visible={isAccountDrawerOpen}
        onClose={() => setAccountDrawerOpen(false)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />
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
