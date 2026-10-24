import { describe, expect, it } from 'vitest';
import {
  feedoraOutboxStorageKey,
  migrateLegacyFeedoraOutbox,
  transferFeedoraOutboxScope,
} from '../apps/feedora-showcase/src/adapters/FeedoraOutboxStorage';

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
}

const queued = (id: string, principalId: string, guestParticipantId?: string) => ({
  envelope: { id, context: { principalId, guestParticipantId } }, queuedAt: 1,
});

describe('Feedora outbox identity scoping', () => {
  it('assigns separate durable keys to each account and guest', () => {
    expect(feedoraOutboxStorageKey('user:alice')).not.toBe(feedoraOutboxStorageKey('user:bob'));
    expect(feedoraOutboxStorageKey('user:alice')).not.toBe(feedoraOutboxStorageKey('guest:alice'));
  });

  it('migrates legacy active and dead-letter queues by captured owner and is idempotent', async () => {
    const store = memoryStore({
      feedora_mobile_outbox_queue: JSON.stringify([queued('a1', 'user-alice'), queued('g1', 'guest-7', 'guest-7')]),
      feedora_mobile_outbox_queue_dlq: JSON.stringify([queued('b1', 'user-bob')]),
    });

    expect(await migrateLegacyFeedoraOutbox(store)).toBe(true);
    expect(JSON.parse(store.values.get(feedoraOutboxStorageKey('user:alice'))!)).toHaveLength(1);
    expect(JSON.parse(store.values.get(feedoraOutboxStorageKey('guest:guest-7'))!)).toHaveLength(1);
    expect(JSON.parse(store.values.get(`${feedoraOutboxStorageKey('user:bob')}_dlq`)!)).toHaveLength(1);
    expect(store.values.has('feedora_mobile_outbox_queue')).toBe(false);
    expect(await migrateLegacyFeedoraOutbox(store)).toBe(true);
    expect(JSON.parse(store.values.get(feedoraOutboxStorageKey('user:alice'))!)).toHaveLength(1);
  });

  it('keeps an unclassifiable legacy queue intact for recovery', async () => {
    const raw = JSON.stringify([{ envelope: { id: 'unknown', context: {} } }]);
    const store = memoryStore({ feedora_mobile_outbox_queue: raw });
    expect(await migrateLegacyFeedoraOutbox(store)).toBe(false);
    expect(store.values.get('feedora_mobile_outbox_queue')).toBe(raw);
    expect(store.values.has('feedora_outbox_scope_migration:v2')).toBe(false);
  });

  it('preserves malformed envelopes when their owner is still known', async () => {
    const malformed = { envelope: { context: { principalId: 'user-alice' } }, queuedAt: 1 };
    const store = memoryStore({ feedora_mobile_outbox_queue: JSON.stringify([malformed]) });
    expect(await migrateLegacyFeedoraOutbox(store)).toBe(true);
    expect(JSON.parse(store.values.get(feedoraOutboxStorageKey('user:alice'))!)).toEqual([malformed]);
  });

  it('transfers guest work to the claimed account and deduplicates retries', async () => {
    const guestKey = feedoraOutboxStorageKey('guest:g1');
    const accountKey = feedoraOutboxStorageKey('user:alice');
    const store = memoryStore({
      [guestKey]: JSON.stringify([queued('submission-1', 'g1', 'g1')]),
      [accountKey]: JSON.stringify([queued('submission-1', 'user-alice')]),
      [`${guestKey}_dlq`]: JSON.stringify([queued('submission-2', 'g1', 'g1')]),
    });
    await transferFeedoraOutboxScope(store, 'guest:g1', 'user:alice');
    expect(JSON.parse(store.values.get(accountKey)!)).toHaveLength(1);
    expect(JSON.parse(store.values.get(`${accountKey}_dlq`)!)).toHaveLength(1);
    expect(store.values.has(guestKey)).toBe(false);
    expect(store.values.has(`${guestKey}_dlq`)).toBe(false);
  });

  it('refuses a scope transfer while either outbox is flushing', async () => {
    const guestKey = feedoraOutboxStorageKey('guest:g1');
    const store = memoryStore({ [`${guestKey}_flush_lock`]: String(Date.now()) });
    await expect(transferFeedoraOutboxScope(store, 'guest:g1', 'user:alice')).rejects.toThrow(/current response sync/);
  });
});
