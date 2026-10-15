import type { ContributionProfile, Entity } from '../types';

/**
 * Persistence boundary behind IContributionPort.
 *
 * Deliberately storage-agnostic: the in-memory store (web/dev) and the
 * expo-sqlite store (Expo Go) both satisfy this, and a Supabase adapter could
 * too — the domain and UI never see the difference.
 */
export interface IEntityStore {
  listEntities(): Entity[];
  getEntity(entityId: string): Entity | undefined;

  getProfile(userId: string, entityId: string): Promise<ContributionProfile | null>;
  putProfile(profile: ContributionProfile): Promise<void>;
  listProfiles(entityId: string): Promise<ContributionProfile[]>;

  /** Persist a completed response so reliability can be computed across the sample. */
  addResponse(items: Record<string, number>): Promise<void>;
  listResponses(): Promise<Record<string, number>[]>;
}

/** Everything needed to prime a fresh store from her real Django data. */
export interface SeedBundle {
  entities: Entity[];
  profiles: ContributionProfile[];
  responses: Record<string, number>[];
}
