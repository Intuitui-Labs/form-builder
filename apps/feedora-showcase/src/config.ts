/**
 * Feedora research backend configuration.
 *
 * `surveyUuid` is the `access_uuid` of a real, active survey in her Django DB
 * (default: the seeded HMSAM survey). Leave it empty to keep the showcase fully
 * local — reads and writes then stay in the on-device store only.
 */
export const FEEDORA_REMOTE = {
  baseUrl: 'http://127.0.0.1:8765',
  surveyUuid: 'ba8ca44c-dc28-481d-9730-4e12c4e281e0',
} as const;

export const remoteEnabled = FEEDORA_REMOTE.surveyUuid.length > 0;
