import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Feedora research backend configuration.
 *
 * `surveyUuid` is the `access_uuid` of a real, active survey in her Django DB
 * (default: the seeded HMSAM survey).
 *
 * For native mobile (Expo Go on Android device/emulator or iOS), localhost/127.0.0.1
 * refers to the device itself. We provide automatic LAN fallback.
 */
const DJANGO_PORT = 8000;
const DEV_MACHINE_LAN_IP = '10.99.171.54'; // Local machine LAN address for physical phone / Expo Go

export function getDjangoBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web') {
    return `http://127.0.0.1:${DJANGO_PORT}`;
  }
  // Expo Go exposes the Metro host as hostUri. Derive the backend host from
  // that address so phones keep working when the developer machine's LAN IP
  // changes. Set EXPO_PUBLIC_API_BASE_URL when Django runs on another host.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    try {
      const expoHost = new URL(`http://${hostUri}`).hostname;
      if (expoHost && expoHost !== 'localhost' && expoHost !== '127.0.0.1') {
        return `http://${expoHost}:${DJANGO_PORT}`;
      }
    } catch {
      // Fall through to the documented development-machine address.
    }
  }
  if (Platform.OS === 'android') {
    return `http://${DEV_MACHINE_LAN_IP}:${DJANGO_PORT}`;
  }
  return `http://${DEV_MACHINE_LAN_IP}:${DJANGO_PORT}`;
}

export const FEEDORA_REMOTE = {
  baseUrl: getDjangoBaseUrl(),
  surveyUuid: 'ba8ca44c-dc28-481d-9730-4e12c4e281e0',
} as const;

/** Django currently owns the research API's cookie session. Other identity providers need a token bridge before selection. */
export const FEEDORA_AUTH_PROVIDER = 'django' as const;

export const remoteEnabled = FEEDORA_REMOTE.surveyUuid.length > 0;

export function getDevMachineLanIp(): string {
  return DEV_MACHINE_LAN_IP;
}

export function getSharableSurveyUrl(accessCode: string, surveyUuid?: string): {
  webUrl: string;
  appDeepLink: string;
  backendUrl: string;
} {
  const host =
    typeof window !== 'undefined' &&
    window.location?.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
      ? window.location.hostname
      : DEV_MACHINE_LAN_IP;
  const port =
    typeof window !== 'undefined' && window.location?.port ? window.location.port : '8081';
  const cleanCode = encodeURIComponent(accessCode || 'HMSAM1');

  return {
    webUrl: `http://${host}:${port}/?code=${cleanCode}`,
    appDeepLink: `exp://${host}:${port}/--/?code=${cleanCode}`,
    backendUrl: `${getDjangoBaseUrl()}/surveys/code/${cleanCode}/`,
  };
}

