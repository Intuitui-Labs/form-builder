/** App-owned identity and scope contracts. Infrastructure stores wire IDs as strings. */
export type PrincipalId = string;
export type ScopeId = string;
export type SubmissionId = string;

export type ScopeRef =
  | { kind: 'platform'; id: 'platform' }
  | { kind: 'organization'; id: ScopeId };

/** Validate and normalize API/legacy scope fields into the app's explicit contract. */
export function scopeRefFromWire(
  kind: 'platform' | 'organization' | undefined,
  id: string | undefined,
): ScopeRef | null {
  if (kind === 'platform') return id === 'platform' ? { kind: 'platform', id: 'platform' } : null;
  const match = /^(?:org-)?(\d+)$/.exec(id?.trim() ?? '');
  if (kind === 'organization' && match) return { kind: 'organization', id: `org-${match[1]}` };
  return null;
}
