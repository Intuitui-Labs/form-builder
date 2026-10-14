import type { INetworkStatusPort } from '../../ports/INetworkStatusPort.js';

/**
 * SimulatedNetworkAdapter
 * Allows interactive toggling between online and offline network states
 * for testing offline-first persistence, outbox spooling, and recovery.
 */
export class SimulatedNetworkAdapter implements INetworkStatusPort {
  private online: boolean;
  private readonly listeners: Set<(isOnline: boolean) => void> = new Set();

  constructor(initialOnline: boolean = true) {
    this.online = initialOnline;
  }

  public isOnline(): boolean {
    return this.online;
  }

  public setOnline(online: boolean): void {
    if (this.online !== online) {
      this.online = online;
      this.listeners.forEach((callback) => {
        try {
          callback(this.online);
        } catch (err) {
          console.error('[SimulatedNetworkAdapter] Listener error:', err);
        }
      });
    }
  }

  public toggle(): boolean {
    this.setOnline(!this.online);
    return this.online;
  }

  public subscribe(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
