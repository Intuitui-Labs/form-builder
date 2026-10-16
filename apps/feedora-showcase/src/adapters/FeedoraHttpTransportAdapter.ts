import type { ITransportPort } from '../domain/ports/ITransportPort';
import type { RemoteSurveyMeta, RemoteSubmitResult } from '../domain/ports/transportTypes';

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
    private readonly fetchImpl: typeof fetch = fetch,
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
    if (meta.survey?.uuid) {
      this.metaCache.set(meta.survey.uuid, meta);
    }
    return meta;
  }

  async submitResponse(
    accessUuid: string,
    answersByCode: Record<string, unknown>,
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
          },
          body: JSON.stringify({ answers: answersPayload }),
          credentials: 'include',
        },
      );

      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  private url(accessUuid: string, suffix: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/surveys/respond/${accessUuid}/${suffix}`;
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
