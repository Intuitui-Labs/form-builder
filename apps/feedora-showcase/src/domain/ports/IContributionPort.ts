import type { ContributionProfile, Entity, Standing } from '../types';

export interface RecordContributionInput {
  userId: string;
  displayName: string;
  avatar?: string;
  entityId: string;
  formId: string;
  surveyTitle?: string;
  points: number;
  isCompletion?: boolean;
}

/**
 * Application-level port (downstream of the engine): the voice economy.
 *
 * Her product is a two-sided contribution economy — people join an entity,
 * contribute voice across many surveys, and accumulate standing. The engine
 * has no concept of a cross-form identity or cumulative points, so this is a
 * second port owned by the app. Persistence is behind this port, so the
 * in-memory demo store can be swapped for a Supabase adapter unchanged.
 */
export interface IContributionPort {
  readonly name: string;

  listEntities(): Entity[];
  getEntity(entityId: string): Entity | undefined;

  /** Joining is idempotent — first call creates the profile, later calls are no-ops. */
  join(
    userId: string,
    displayName: string,
    avatar: string,
    entityId: string,
    initialPoints?: number,
  ): Promise<ContributionProfile>;

  getProfile(userId: string, entityId: string): Promise<ContributionProfile | null>;

  /** Apply earned points to a contributor and persist them. */
  recordContribution(input: RecordContributionInput): Promise<ContributionProfile>;

  /** Apply one canonical server receipt once, including its scoped history row. */
  recordReceipt(input: RecordContributionInput & {
    submissionId: string;
    responseId: string;
    completedAt: string;
  }): Promise<ContributionProfile>;

  /** Leaderboard for one entity, strongest contributors first. */
  listContributors(entityId: string): Promise<ContributionProfile[]>;

  /** Pure level-curve lookup for a given points total. */
  standingFor(totalPoints: number): Standing;
}
