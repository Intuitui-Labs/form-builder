/**
 * Outbound Port: Contract for network connectivity detection.
 * Allows host apps to plug in @react-native-community/netinfo,
 * TanStack Query onlineManager, browser navigator.onLine, or WebSocket heartbeats.
 */
export interface INetworkStatusPort {
  isOnline(): Promise<boolean> | boolean;
  subscribe(callback: (isOnline: boolean) => void): () => void;
}
