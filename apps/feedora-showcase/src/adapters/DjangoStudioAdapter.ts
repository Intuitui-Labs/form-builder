import type {
  CreateSurveyPayload,
  ICreatorStudioPort,
  StudioSurvey,
} from '../domain/ports/ICreatorStudioPort';

export class DjangoStudioAdapter implements ICreatorStudioPort {
  constructor(
    private readonly baseUrl: string = 'http://localhost:8000',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  async listSurveys(): Promise<StudioSurvey[]> {
    try {
      // 1. Try listing creator's owned surveys
      const res = await this.fetchImpl(this.url('/api/v1/surveys/mine/'), {
        method: 'GET',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.surveys)) {
          return data.surveys;
        }
      }
    } catch {
      // Network or offline fallback
    }

    try {
      // 2. Fallback to public active surveys if unauthenticated or error
      const publicRes = await this.fetchImpl(this.url('/api/v1/surveys/'), {
        method: 'GET',
      });
      if (publicRes.ok) {
        const data = await publicRes.json();
        if (data.ok && Array.isArray(data.surveys)) {
          return data.surveys.map((s: any) => ({
            id: s.id,
            uuid: s.uuid,
            accessCode: s.accessCode || '',
            title: s.title,
            description: s.description || '',
            isHmsam: Boolean(s.isHmsam),
            isActive: true,
            isDraft: false,
            questionsCount: s.questionsCount || 0,
            responsesCount: 0,
            createdAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // Return empty array if backend unreachable
    }

    return [];
  }

  async createSurvey(payload: CreateSurveyPayload): Promise<{
    ok: boolean;
    uuid: string;
    accessCode: string;
    surveyId: number;
    questionsCount: number;
    isDraft?: boolean;
    isActive?: boolean;
  }> {
    const res = await this.fetchImpl(this.url('/api/v1/surveys/create/'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      const msg = data?.error || `Failed to create survey (HTTP ${res.status})`;
      throw new Error(msg);
    }

    return {
      ok: true,
      uuid: data.uuid,
      accessCode: data.accessCode,
      surveyId: data.surveyId,
      questionsCount: data.questionsCount || payload.questions.length,
      isDraft: data.isDraft,
      isActive: data.isActive,
    };
  }

  async togglePublish(uuid: string, isDraft?: boolean): Promise<{
    ok: boolean;
    uuid: string;
    accessCode: string;
    isDraft: boolean;
    isActive: boolean;
    status: 'draft' | 'published';
  }> {
    const res = await this.fetchImpl(this.url(`/api/v1/surveys/${uuid}/publish/`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(isDraft !== undefined ? { is_draft: isDraft } : {}),
      credentials: 'include',
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Failed to update survey status (HTTP ${res.status})`);
    }

    return data;
  }
}
