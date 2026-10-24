const GUEST_TOKEN_KEY = 'feedora_guest_token';

/** Browser storage adapter; browser credentials remain local to this origin. */
export async function getGuestCredential(): Promise<string | null> {
  try { return globalThis.localStorage?.getItem(GUEST_TOKEN_KEY) ?? null; } catch { return null; }
}

export async function setGuestCredential(token: string): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
  globalThis.localStorage.setItem(GUEST_TOKEN_KEY, token);
}

export async function clearGuestCredential(): Promise<void> {
  try { globalThis.localStorage?.removeItem(GUEST_TOKEN_KEY); } catch {}
}
