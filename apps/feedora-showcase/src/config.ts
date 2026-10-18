import { Platform } from 'react-native';

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
  if (Platform.OS === 'android') {
    // Android emulator can use 10.0.2.2; physical device uses LAN IP
    return `http://${DEV_MACHINE_LAN_IP}:${DJANGO_PORT}`;
  }
  return `http://${DEV_MACHINE_LAN_IP}:${DJANGO_PORT}`;
}

export const FEEDORA_REMOTE = {
  baseUrl: getDjangoBaseUrl(),
  surveyUuid: 'ba8ca44c-dc28-481d-9730-4e12c4e281e0',
} as const;

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

