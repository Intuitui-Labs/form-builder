import type { INetworkStatusPort } from '../../ports/INetworkStatusPort.js';

/**
 * Default fallback network status adapter assuming perpetual connectivity.
 * Ideal for Node.js servers, unit tests, and host environments without NetInfo.
 */
export class AlwaysOnlineNetworkAdapter implements INetworkStatusPort {
  public isOnline(): boolean {
    return true;
  }

  public subscribe(_callback: (isOnline: boolean) => void): () => void {
    return () => {};
  }
}
