import type { INetworkStatusPort } from '../../ports/INetworkStatusPort.js';

/**
 * Browser-native network status adapter using navigator.onLine and online/offline event listeners.
 */
export class WebNetworkStatusAdapter implements INetworkStatusPort {
  public isOnline(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return true;
    }
    return navigator.onLine ?? true;
  }

  public subscribe(callback: (isOnline: boolean) => void): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const onOnline = () => callback(true);
    const onOffline = () => callback(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
}
