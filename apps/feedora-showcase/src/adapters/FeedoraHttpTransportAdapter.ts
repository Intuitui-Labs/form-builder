import type { ITransportPort } from '../domain/ports/ITransportPort';
import type {
  RemoteSurveyMeta,
  RemoteSubmitResult,
  RemoteSurveyAnalysis,
  RemoteLeaderboardResult,
} from '../domain/ports/transportTypes';
import type { RemoteSurveyCatalogItem } from '../domain/ports/transportTypes';

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

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {}

  async fetchSurveyMeta(accessUuid: string): Promise<RemoteSurveyMeta> {
    const response = await this.fetchImpl(this.url(accessUuid, 'meta/'), {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Feedora meta request failed (${response.status})`);
    }
    this.captureCsrf(response);
    const meta = (await response.json()) as RemoteSurveyMeta;
    this.csrfToken = meta.csrfToken ?? this.csrfToken;
    this.metaCache.set(accessUuid, meta);
    return meta;
  }

  async fetchSurveyMetaByCode(accessCode: string): Promise<RemoteSurveyMeta> {
    const cleanCode = accessCode.trim().toUpperCase();
    const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/code/${encodeURIComponent(cleanCode)}/meta/`;
    const response = await this.fetchImpl(endpoint, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Survey with access code '${cleanCode}' not found (${response.status})`);
    }
    this.captureCsrf(response);
    const meta = (await response.json()) as RemoteSurveyMeta;
    this.csrfToken = meta.csrfToken ?? this.csrfToken;
    if (meta.survey?.uuid) {
      this.metaCache.set(meta.survey.uuid, meta);
    }
    return meta;
  }

  async fetchPublicSurveys(entityId?: string, guestParticipantId?: string): Promise<RemoteSurveyCatalogItem[]> {
    const params = new URLSearchParams();
    if (entityId) params.set('entity_id', entityId);
    if (guestParticipantId) params.set('guest_participant_id', guestParticipantId);
    const query = params.toString();
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${query ? `?${query}` : ''}`, {
        method: 'GET',
        credentials: 'include',
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
    },
  ): Promise<RemoteSubmitResult> {
    const meta = this.metaCache.get(accessUuid) ?? (await this.fetchSurveyMeta(accessUuid));

    const answersPayload: Record<string, unknown> = {};
    for (const question of meta.questions) {
      const value = answersByCode[question.code] ?? answersByCode[String(question.id)];
      if (value !== undefined && value !== null && value !== '') {
        answersPayload[String(question.id)] = value;
      }
    }

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/+$/, '')}/api/v1/surveys/${accessUuid}/submit/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
            guestParticipantId: options?.guestParticipantId,
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
        pointsEarned: resData?.pointsEarned,
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
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, '')}/api/v1/leaderboard/?${query}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch organization leaderboard (${response.status})`);
    }
    return (await response.json()) as RemoteLeaderboardResult;
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
