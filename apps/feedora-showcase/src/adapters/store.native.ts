import { SqliteEntityStore } from './SqliteEntityStore';
import { buildSeed } from '../fixtures/seed';
import type { IEntityStore } from '../domain/ports/IEntityStore';

/**
 * Native store — expo-sqlite. Bundled in Expo Go, so this runs there with no
 * development build. Same IEntityStore contract as the web in-memory store.
 */
export function createStore(): IEntityStore {
  return new SqliteEntityStore(buildSeed());
}
