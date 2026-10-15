import type { IEntityStore, SeedBundle } from '../domain/ports/IEntityStore';
import type { ContributionProfile, Entity } from '../domain/types';

const KEY_SEPARATOR = '::';

/**
 * In-memory persistence behind IEntityStore.
 *
 * This is the web/dev fallback (expo-sqlite drives the native build). Both
 * satisfy IEntityStore, so the domain and UI never know the difference.
 */
export class InMemoryEntityStore implements IEntityStore {
  private readonly profiles = new Map<string, ContributionProfile>();
  private responses: Record<string, number>[] = [];

  constructor(private readonly entities: Entity[], seed?: SeedBundle) {
    if (seed) {
      for (const profile of seed.profiles) {
        this.profiles.set(this.key(profile.userId, profile.entityId), profile);
      }
      this.responses = [...seed.responses];
    }
  }

  listEntities(): Entity[] {
    return this.entities;
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.find((entity) => entity.id === entityId);
  }

  private key(userId: string, entityId: string): string {
    return `${userId}${KEY_SEPARATOR}${entityId}`;
  }

  async getProfile(userId: string, entityId: string): Promise<ContributionProfile | null> {
    return this.profiles.get(this.key(userId, entityId)) ?? null;
  }

  async putProfile(profile: ContributionProfile): Promise<void> {
    this.profiles.set(this.key(profile.userId, profile.entityId), profile);
  }

  async listProfiles(entityId: string): Promise<ContributionProfile[]> {
    return [...this.profiles.values()].filter((profile) => profile.entityId === entityId);
  }

  async addResponse(items: Record<string, number>): Promise<void> {
    this.responses.push(items);
  }

  async listResponses(): Promise<Record<string, number>[]> {
    return this.responses;
  }
}
