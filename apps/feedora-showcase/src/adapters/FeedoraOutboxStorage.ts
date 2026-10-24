import type { IEntityStore } from '../domain/ports/IEntityStore';

const LEGACY_OUTBOX_KEY = 'feedora_mobile_outbox_queue';
const OUTBOX_KEY_PREFIX = `${LEGACY_OUTBOX_KEY}:v2:`;
const MIGRATION_MARKER = 'feedora_outbox_scope_migration:v2';
const ACTIVE_LOCK_MS = 10_000;

type StoredOutboxItem = {
  envelope?: {
    id?: string;
    context?: {
      principalId?: string;
      guestParticipantId?: string;
    };
  };
  [key: string]: unknown;
};

export function feedoraOutboxStorageKey(ownerKey: string): string {
  return `${OUTBOX_KEY_PREFIX}${encodeURIComponent(ownerKey)}`;
}

function parseItems(raw: string | null, key: string): StoredOutboxItem[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object')) {
    throw new Error(`Invalid saved outbox data at ${key}.`);
  }
  return value as StoredOutboxItem[];
}

function deduplicate(items: StoredOutboxItem[]): StoredOutboxItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = item.envelope?.id;
    // Preserve malformed but identifiable-owner envelopes for later recovery.
    if (typeof id !== 'string' || !id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function ownerKeyFor(item: StoredOutboxItem): string | null {
  const context = item.envelope?.context;
  const principalId = context?.principalId?.trim();
  if (principalId?.startsWith('user-')) return `user:${principalId.slice('user-'.length)}`;
  const guestId = context?.guestParticipantId?.trim() || principalId;
  return guestId ? `guest:${guestId}` : null;
}

async function transferList(
  store: Pick<IEntityStore, 'getItem' | 'setItem' | 'removeItem'>,
  fromKey: string,
  toKey: string,
): Promise<void> {
  const source = parseItems(await store.getItem(fromKey), fromKey);
  if (source.length === 0) return;
  const destination = parseItems(await store.getItem(toKey), toKey);
  const merged = deduplicate([...destination, ...source]);
  await store.setItem(toKey, JSON.stringify(merged));
  await store.removeItem(fromKey);
}

async function assertNoActiveFlush(
  store: Pick<IEntityStore, 'getItem'>,
  keys: string[],
): Promise<void> {
  const now = Date.now();
  for (const key of keys) {
    const lock = Number(await store.getItem(key));
    if (Number.isFinite(lock) && lock > 0 && now - lock < ACTIVE_LOCK_MS) {
      throw new Error('Wait for the current response sync to finish before changing its account scope.');
    }
  }
}

/** Split the old shared queue by its captured server principal without losing pending answers. */
export async function migrateLegacyFeedoraOutbox(
  store: Pick<IEntityStore, 'getItem' | 'setItem' | 'removeItem'>,
): Promise<boolean> {
  if (await store.getItem(MIGRATION_MARKER)) return true;
  await assertNoActiveFlush(store, [`${LEGACY_OUTBOX_KEY}_flush_lock`]);

  const destinations = new Map<string, { queue: StoredOutboxItem[]; deadLetters: StoredOutboxItem[] }>();
  for (const suffix of ['', '_dlq']) {
    const sourceKey = `${LEGACY_OUTBOX_KEY}${suffix}`;
    const items = parseItems(await store.getItem(sourceKey), sourceKey);
    for (const item of items) {
      const ownerKey = ownerKeyFor(item);
      if (!ownerKey) return false;
      const grouped = destinations.get(ownerKey) ?? { queue: [], deadLetters: [] };
      (suffix === '_dlq' ? grouped.deadLetters : grouped.queue).push(item);
      destinations.set(ownerKey, grouped);
    }
  }

  for (const [ownerKey, items] of destinations) {
    const destinationBase = feedoraOutboxStorageKey(ownerKey);
    for (const [suffix, matching] of [['', items.queue], ['_dlq', items.deadLetters]] as const) {
      if (matching.length === 0) continue;
      const destinationKey = `${destinationBase}${suffix}`;
      const existing = parseItems(await store.getItem(destinationKey), destinationKey);
      await store.setItem(destinationKey, JSON.stringify(deduplicate([...existing, ...matching])));
    }
  }

  await store.removeItem(LEGACY_OUTBOX_KEY);
  await store.removeItem(`${LEGACY_OUTBOX_KEY}_dlq`);
  await store.removeItem(`${LEGACY_OUTBOX_KEY}_flush_lock`);
  await store.setItem(MIGRATION_MARKER, 'complete');
  return true;
}

/** Move guest work to the account that successfully claimed that server guest principal. */
export async function transferFeedoraOutboxScope(
  store: Pick<IEntityStore, 'getItem' | 'setItem' | 'removeItem'>,
  fromOwnerKey: string,
  toOwnerKey: string,
): Promise<void> {
  if (fromOwnerKey === toOwnerKey) return;
  const fromBase = feedoraOutboxStorageKey(fromOwnerKey);
  const toBase = feedoraOutboxStorageKey(toOwnerKey);
  await assertNoActiveFlush(store, [`${fromBase}_flush_lock`, `${toBase}_flush_lock`]);
  await transferList(store, fromBase, toBase);
  await transferList(store, `${fromBase}_dlq`, `${toBase}_dlq`);
}
