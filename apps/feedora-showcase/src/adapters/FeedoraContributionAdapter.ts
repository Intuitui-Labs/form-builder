import { standingFor } from '../domain/levels';
import type { IEntityStore } from '../domain/ports/IEntityStore';
import type { IContributionPort, RecordContributionInput } from '../domain/ports/IContributionPort';
import { FEEDORA_BADGES, type ContributionProfile, type Entity, type Standing } from '../domain/types';

/**
 * Outbound adapter -> app's IContributionPort (the voice economy).
 *
 * Owns her level curve (`accounts/utils.py`) and her response-count badges
 * (Bronze/Silver/Gold). Cumulative standing is inherently cross-form and
 * cross-session, so the engine cannot model it; this adapter keeps it in the
 * app, persisted through the store (in-memory on web, SQLite in Expo Go).
 */
export class FeedoraContributionAdapter implements IContributionPort {
  readonly name = 'FeedoraContributionAdapter';

  constructor(private readonly store: IEntityStore) {}

  listEntities(): Entity[] {
    return this.store.listEntities();
  }

  getEntity(entityId: string): Entity | undefined {
    return this.store.getEntity(entityId);
  }

  standingFor(totalPoints: number): Standing {
    return standingFor(totalPoints);
  }

  async join(
    userId: string,
    displayName: string,
    avatar: string,
    entityId: string,
    initialPoints = 0,
  ): Promise<ContributionProfile> {
    const existing = await this.store.getProfile(userId, entityId);
    if (existing) {
      if (initialPoints > existing.totalPoints) {
        existing.totalPoints = initialPoints;
        existing.standing = standingFor(existing.totalPoints);
        await this.store.putProfile(existing);
      }
      return existing;
    }

    const profile: ContributionProfile = {
      userId,
      displayName,
      avatar,
      entityId,
      totalPoints: Math.max(0, initialPoints),
      surveysCompleted: 0,
      badges: [],
      standing: standingFor(Math.max(0, initialPoints)),
      updatedAt: new Date().toISOString(),
    };
    await this.store.putProfile(profile);
    return profile;
  }

  async getProfile(userId: string, entityId: string): Promise<ContributionProfile | null> {
    return this.store.getProfile(userId, entityId);
  }

  async recordContribution(input: RecordContributionInput): Promise<ContributionProfile> {
    const existing = await this.store.getProfile(input.userId, input.entityId);
    const profile: ContributionProfile = existing ?? {
      userId: input.userId,
      displayName: input.displayName,
      avatar: input.avatar ?? '🗣️',
      entityId: input.entityId,
      totalPoints: 0,
      surveysCompleted: 0,
      badges: [],
      standing: standingFor(0),
      updatedAt: new Date().toISOString(),
    };

    profile.totalPoints += Math.max(0, Math.round(input.points));
    if (input.isCompletion) {
      profile.surveysCompleted += 1;
    }
    profile.badges = this.computeBadges(profile.surveysCompleted);
    profile.standing = standingFor(profile.totalPoints);
    profile.updatedAt = new Date().toISOString();

    await this.store.putProfile(profile);
    return profile;
  }

  async listContributors(entityId: string): Promise<ContributionProfile[]> {
    const profiles = await this.store.listProfiles(entityId);
    return profiles.sort(
      (a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName),
    );
  }

  /** Her badges are earned by total responses across surveys. */
  private computeBadges(surveysCompleted: number): string[] {
    return FEEDORA_BADGES.filter((badge) => surveysCompleted >= badge.minResponses).map(
      (badge) => badge.id,
    );
  }
}
