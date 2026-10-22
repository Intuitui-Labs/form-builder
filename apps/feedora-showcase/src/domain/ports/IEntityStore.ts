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

  /** Submission history tracking for respondent profile. */
  recordSurveyResponse(record: SubmissionHistoryRecord): Promise<void>;
  listUserHistory(userId: string): Promise<SubmissionHistoryRecord[]>;
  getPointsByEntity(userId: string): Promise<Record<string, number>>;
  /** Atomically transfer a guest principal's profiles and history to an account. */
  claimGuestIdentity(guestUserId: string, accountUserId: string): Promise<void>;

  /** Key-value storage for settings, auth session, and studio drafts. */
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SubmissionHistoryRecord {
  id?: number;
  entityId: string;
  surveyId: string;
  surveyTitle: string;
  userId: string;
  pointsEarned: number;
  completedAt: string;
}

/** Everything needed to prime a fresh store from her real Django data. */
export interface SeedBundle {
  entities: Entity[];
  profiles: ContributionProfile[];
  responses: Record<string, number>[];
}
