import { InMemoryEntityStore } from './InMemoryEntityStore';
import { buildSeed } from '../fixtures/seed';
import type { IEntityStore } from '../domain/ports/IEntityStore';

/**
 * Default store — used on web and by the type-checker.
 *
 * On native, Metro resolves `./store.native.ts` instead, which swaps in the
 * expo-sqlite-backed store with the same interface.
 */
export function createStore(): IEntityStore {
  const seed = buildSeed();
  return new InMemoryEntityStore(seed.entities, seed);
}
