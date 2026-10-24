import type { Entity } from './types';

/** Normalize Django's numeric and `org-<id>` aliases to one stable app ID. */
export function canonicalEntityId(value: string): string {
  const match = /^(?:org-)?(\d+)$/.exec(value.trim());
  return match ? `org-${match[1]}` : value.trim();
}

/**
 * API and seed data can describe the same organization using different ID
 * aliases. Normalize before rendering so an organization appears only once.
 */
export function uniqueEntities(items: readonly Entity[]): Entity[] {
  const byId = new Map<string, Entity>();

  for (const item of items) {
    const id = canonicalEntityId(item.id);
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, existing ? { ...existing, ...item, id } : { ...item, id });
  }

  return [...byId.values()];
}
