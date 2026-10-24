import * as SecureStore from 'expo-secure-store';

const GUEST_TOKEN_KEY = 'feedora_guest_token';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function getGuestCredential(): Promise<string | null> {
  return SecureStore.getItemAsync(GUEST_TOKEN_KEY, OPTIONS);
}

export function setGuestCredential(token: string): Promise<void> {
  return SecureStore.setItemAsync(GUEST_TOKEN_KEY, token, OPTIONS);
}

export function clearGuestCredential(): Promise<void> {
  return SecureStore.deleteItemAsync(GUEST_TOKEN_KEY, OPTIONS);
}
