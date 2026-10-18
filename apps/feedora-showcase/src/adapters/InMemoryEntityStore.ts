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

  private history: Array<{
    id: number;
    entityId: string;
    surveyId: string;
    surveyTitle: string;
    userId: string;
    pointsEarned: number;
    completedAt: string;
  }> = [];

  constructor(private readonly entities: Entity[], seed?: SeedBundle) {
    if (seed) {
      for (const profile of seed.profiles) {
        this.profiles.set(this.key(profile.userId, profile.entityId), profile);
      }
      this.responses = [...seed.responses];
    }
    this.restoreFromStorage();
  }

  private restoreFromStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedProfiles = window.localStorage.getItem('feedora:profiles');
        if (storedProfiles) {
          const entries = JSON.parse(storedProfiles) as [string, ContributionProfile][];
          for (const [k, p] of entries) {
            this.profiles.set(k, p);
          }
        }
        const storedHistory = window.localStorage.getItem('feedora:history');
        if (storedHistory) {
          this.history = JSON.parse(storedHistory);
        }
      }
    } catch {
      // In private browsing or non-DOM
    }
  }

  private persistStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'feedora:profiles',
          JSON.stringify([...this.profiles.entries()]),
        );
        window.localStorage.setItem(
          'feedora:history',
          JSON.stringify(this.history.slice(0, 200)),
        );
      }
    } catch {
      // In private browsing or non-DOM
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
    const direct = this.profiles.get(this.key(userId, entityId));
    if (direct) return direct;
    const altEntityId = entityId.startsWith('org-') ? entityId.replace('org-', '') : `org-${entityId}`;
    return this.profiles.get(this.key(userId, altEntityId)) ?? null;
  }

  async putProfile(profile: ContributionProfile): Promise<void> {
    this.profiles.set(this.key(profile.userId, profile.entityId), profile);
    this.persistStorage();
  }

  async listProfiles(entityId: string): Promise<ContributionProfile[]> {
    const altEntityId = entityId.startsWith('org-') ? entityId.replace('org-', '') : `org-${entityId}`;
    return [...this.profiles.values()].filter(
      (profile) => profile.entityId === entityId || profile.entityId === altEntityId,
    );
  }

  private readonly kvStore = new Map<string, string>();

  async addResponse(items: Record<string, number>): Promise<void> {
    this.responses.push(items);
  }

  async listResponses(): Promise<Record<string, number>[]> {
    return this.responses;
  }

  async recordSurveyResponse(record: {
    id?: number;
    entityId: string;
    surveyId: string;
    surveyTitle: string;
    userId: string;
    pointsEarned: number;
    completedAt: string;
  }): Promise<void> {
    this.history.unshift({
      id: this.history.length + 1,
      ...record,
    });
    this.persistStorage();
  }

  async listUserHistory(userId: string) {
    return this.history.filter((h) => h.userId === userId);
  }

  async reassignUserHistory(fromUserId: string, toUserId: string): Promise<void> {
    for (const h of this.history) {
      if (h.userId === fromUserId) {
        h.userId = toUserId;
      }
    }
    this.persistStorage();
  }

  async getPointsByEntity(userId: string): Promise<Record<string, number>> {
    const res: Record<string, number> = {};
    for (const h of this.history) {
      if (h.userId === userId) {
        res[h.entityId] = (res[h.entityId] || 0) + h.pointsEarned;
      }
    }
    return res;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {
      // In private browsing or non-DOM
    }
    return this.kvStore.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.kvStore.set(key, value);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // In private browsing or non-DOM
    }
  }

  async removeItem(key: string): Promise<void> {
    this.kvStore.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // In private browsing or non-DOM
    }
  }
}
