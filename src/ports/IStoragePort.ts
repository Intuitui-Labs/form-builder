/**
 * Outbound Port: Contract for key-value storage.
 * Compatible with in-memory storage, Web localStorage/sessionStorage,
 * React Native MMKV, AsyncStorage, Expo SQLite, and WatermelonDB.
 */
export interface IStoragePort {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
  getAllKeys?(): Promise<string[]> | string[];
}
