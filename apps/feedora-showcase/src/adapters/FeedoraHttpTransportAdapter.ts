import type { ITransportPort } from '../domain/ports/ITransportPort';
import type {
  RemoteSurveyMeta,
  RemoteSubmitResult,
  RemoteSurveyAnalysis,
  RemoteLeaderboardResult,
} from '../domain/ports/transportTypes';
import type { RemoteSurveyCatalogItem } from '../domain/ports/transportTypes';
import { scopeRefFromWire } from '../domain/identity';

/**
 * Outbound adapter -> Feedora's Django backend over plain HTTP.
 *
 * Uses her EXISTING respondent endpoints — no bespoke server contract needed:
 *   GET  /surveys/respond/<uuid>/meta/    (JSON metadata; also seeds CSRF)
 *   POST /surveys/respond/<uuid>/submit/  (form-encoded, keys `q_<question id>`)
 *
 * Submitting through `submit_response` (rather than writing her SQLite directly)
 * preserves every server-side rule: Response/Answer creation, points, level
 * recalculation and the level-up email.
 *
 * CSRF: the meta GET carries `Set-Cookie: csrftoken=…`; we echo it back as the
 * `X-CSRFToken` header on submit, matching Django's CsrfViewMiddleware.
 */
export class FeedoraHttpTransportAdapter implements ITransportPort {
  readonly name = 'FeedoraHttpTransportAdapter';

  private readonly metaCache = new Map<string, RemoteSurveyMeta>();
  private csrfToken: string | null = null;
  private guestToken: string | null = null;
  private readonly admissionGrants = new Map<string, string>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {}

  setGuestToken(token: string | null): void {
    this.guestToken = token;
  }

  async fetchSurveyMeta(accessUuid: string): Promise<RemoteSurveyMeta> {
    const response = await this.fetchImpl(this.url(accessUuid, 'meta/'), {
      method: 'GET',
      credentials: 'include',
      headers: this.requestHeaders(accessUuid),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const error = new Error(result?.error || `Feedora meta request failed (${response.status})`);
      Object.assign(error, { status: response.status, code: result?.code });
      throw error;
    }
    this.captureCsrf(response);
    const meta = (await response.json()) as RemoteSurveyMeta;
    meta.survey.scope = scopeRefFromWire(meta.survey.scopeKind, meta.survey.scopeId) ?? undefined;
    this.csrfToken = meta.csrfToken ?? this.csrfToken;
    this.metaCache.set(accessUuid, meta);
    return meta;
  }

  async startSurveyAttempt(accessUuid: string, attemptId: string, scopeId?: string) {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/attempts/start/`,
        {
          method: 'POST',
          credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...this.requestHeaders(accessUuid),
          ...(this.csrfToken || this.readCookie('csrftoken')
            ? { 'X-CSRFToken': this.csrfToken ?? this.readCookie('csrftoken')! }
            : {}),
        },
          body: JSON.stringify({ attemptId, ...(scopeId ? { scopeId } : {}) }),
        },
      );
    } catch (cause) {
      const error = new Error('The research service is offline.', { cause });
      Object.assign(error, { status: 0 });
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true || typeof result.attemptId !== 'string' || typeof result.policyVersion !== 'string') {
      const error = new Error(result?.error || `Could not start this survey (${response.status}).`);
      Object.assign(error, { status: response.status, code: result?.code });
      throw error;
    }
    return {
      attemptId: result.attemptId as string,
      policyVersion: result.policyVersion as string,
      scopeId: result.scopeId as string,
      scopeKind: result.scopeKind as 'platform' | 'organization',
      resumed: Boolean(result.resumed),
    };
  }

  async verifySurveyAccessCode(accessUuid: string, accessCode: string): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/access/verify/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...this.requestHeaders(accessUuid) },
      body: JSON.stringify({ accessCode: accessCode.trim().toUpperCase() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result?.accessGrant !== 'string') {
      throw new Error(result?.error || 'That access code could not be verified.');
    }
    this.admissionGrants.set(accessUuid, result.accessGrant);
  }

  private requestHeaders(accessUuid: string): Record<string, string> {
    return {
      ...(this.guestToken ? { 'X-Feedora-Guest-Token': this.guestToken } : {}),
      ...(this.admissionGrants.get(accessUuid) ? { 'X-Feedora-Access-Grant': this.admissionGrants.get(accessUuid)! } : {}),
    };
  }

  async fetchSurveyMetaByCode(accessCode: string): Promise<RemoteSurveyMeta> {
    const cleanCode = accessCode.trim().toUpperCase();
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/code/${encodeURIComponent(cleanCode)}/meta/`;
    const response = await this.fetchImpl(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: this.requestHeaders(''),
    });
    if (!response.ok) {
      throw new Error(`Survey with access code '${cleanCode}' not found (${response.status})`);
    }
    this.captureCsrf(response);
    const meta = (await response.json()) as RemoteSurveyMeta;
    meta.survey.scope = scopeRefFromWire(meta.survey.scopeKind, meta.survey.scopeId) ?? undefined;
    this.csrfToken = meta.csrfToken ?? this.csrfToken;
    if (meta.survey?.uuid) {
      this.metaCache.set(meta.survey.uuid, meta);
      if (meta.accessGrant) this.admissionGrants.set(meta.survey.uuid, meta.accessGrant);
    }
    return meta;
  }

  async fetchPublicSurveys(entityId?: string, _guestParticipantId?: string): Promise<RemoteSurveyCatalogItem[]> {
    const params = new URLSearchParams();
    if (entityId) params.set('entity_id', entityId);
    const query = params.toString();
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${query ? `?${query}` : ''}`, {
        method: 'GET',
        credentials: 'include',
      headers: this.guestToken ? { 'X-Feedora-Guest-Token': this.guestToken } : {},
      });
    if (!response.ok) {
      throw new Error(`Survey catalog request failed (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.surveys)) {
      throw new Error('The research server returned an invalid survey catalog.');
    }
    return data.surveys;
  }

  async submitResponse(
    accessUuid: string,
    answersByCode: Record<string, unknown>,
    options?: {
      variant?: string;
      platform?: string;
      durationMs?: number;
      dwellMs?: Record<string, number>;
      qualityFlags?: string[];
      consentVersion?: string;
      guestParticipantId?: string;
      submissionId?: string;
      principalId?: string;
      scope?: import('../domain/identity').ScopeRef;
      scopeId?: string;
      policyVersion?: string;
      attemptId?: string;
    },
  ): Promise<RemoteSubmitResult> {
    const answersPayload: Record<string, unknown> = {};
    let meta = this.metaCache.get(accessUuid);
    if (!meta) {
      try {
        meta = await this.fetchSurveyMeta(accessUuid);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        // A replay may arrive after the original attempt has completed or the
        // caller has lost eligibility. The server resolves accepted receipts
        // before current policy, so preserve the saved answers and try that
        // idempotent receipt path without fetching question metadata again.
        if (![401, 403, 409, 429].includes(status ?? -1)) throw error;
      }
    }
    if (meta) {
      for (const question of meta.questions) {
        const value = answersByCode[question.code] ?? answersByCode[String(question.id)];
        if (value !== undefined && value !== null && value !== '') {
          answersPayload[String(question.id)] = value;
        }
      }
    } else {
      Object.assign(answersPayload, answersByCode);
    }

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/submit/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.guestToken ? { 'X-Feedora-Guest-Token': this.guestToken } : {}),
            ...(this.admissionGrants.get(accessUuid) ? { 'X-Feedora-Access-Grant': this.admissionGrants.get(accessUuid)! } : {}),
            ...(this.csrfToken || this.readCookie('csrftoken')
              ? { 'X-CSRFToken': this.csrfToken ?? this.readCookie('csrftoken')! }
              : {}),
          },
          body: JSON.stringify({
            answers: answersPayload,
            variant: options?.variant ?? 'gamified',
            platform: options?.platform ?? 'mobile',
            durationMs: options?.durationMs,
            dwellMs: options?.dwellMs,
            qualityFlags: options?.qualityFlags ?? [],
            consentVersion: options?.consentVersion ?? '1.0',
            submissionId: options?.submissionId,
            ...(options?.principalId?.startsWith('user-') ? { principalId: options.principalId } : {}),
            scopeId: options?.scope?.id ?? options?.scopeId,
            policyVersion: options?.policyVersion,
            attemptId: options?.attemptId,
          }),
          credentials: 'include',
        },
      );

      let resData: any = null;
      try {
        resData = await response.json();
      } catch {}

      return {
        ok: response.ok,
        status: response.status,
        code: resData?.code,
        error: resData?.error,
        unlocksAt: resData?.unlocksAt,
        responseId: resData?.responseId,
        submissionId: resData?.submissionId,
        principalId: resData?.principalId,
        scopeId: resData?.scopeId,
        scopeKind: resData?.scopeKind,
        scope: scopeRefFromWire(resData?.scopeKind, resData?.scopeId) ?? undefined,
        policyVersion: resData?.policyVersion,
        acceptedAt: resData?.acceptedAt,
        replayed: resData?.replayed,
        pointsEarned: resData?.pointsEarned,
        scopeTotalPoints: resData?.scopeTotalPoints,
        accountTotalPoints: resData?.accountTotalPoints,
        platformPoints: resData?.platformPoints,
        variableBonus: resData?.variableBonus,
        bonusLabel: resData?.bonusLabel,
        negativeReinforcement: resData?.negativeReinforcement,
        totalPoints: resData?.totalPoints,
        user: resData?.user,
      };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async fetchSurveyAnalysis(accessUuid: string): Promise<RemoteSurveyAnalysis> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/analysis/`;
    const response = await this.fetchImpl(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch survey analysis for ${accessUuid} (${response.status})`);
    }
    return (await response.json()) as RemoteSurveyAnalysis;
  }

  async fetchLeaderboard(entityId: string): Promise<RemoteLeaderboardResult> {
    const query = new URLSearchParams({ entity_id: entityId });
    if (entityId === 'platform') query.set('scope', 'global');
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/leaderboard/?${query}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch organization leaderboard (${response.status})`);
    }
    return (await response.json()) as RemoteLeaderboardResult;
  }

  async setOrganizationAggregateSharing(entityId: string, enabled: boolean): Promise<void> {
    const base = this.baseUrl.replace(/\/+$/, '');
    const csrfResponse = await this.fetchImpl(`${base}/api/v1/auth/me/`, { credentials: 'include' });
    if (!csrfResponse.ok) throw new Error(`Could not prepare organization settings (${csrfResponse.status}).`);
    const csrfData = await csrfResponse.json();
    this.csrfToken = csrfData?.csrfToken ?? this.csrfToken;

    const response = await this.fetchImpl(`${base}/api/v1/entities/${encodeURIComponent(entityId)}/platform-sharing/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(this.csrfToken || this.readCookie('csrftoken')
          ? { 'X-CSRFToken': this.csrfToken ?? this.readCookie('csrftoken')! }
          : {}),
      },
      body: JSON.stringify({ shareAggregateStats: enabled }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `Could not update organization sharing (${response.status}).`);
    }
  }

  private url(accessUuid: string, suffix: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/${suffix}`;
  }

  private captureCsrf(response: Response): void {
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie?.match(/csrftoken=([^;]+)/);
    if (match) this.csrfToken = match[1]!;
  }

  private readCookie(name: string): string | null {
    const doc = (globalThis as { document?: { cookie?: string } }).document;
    if (!doc?.cookie) return null;
    const match = doc.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
  }
}
