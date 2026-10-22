export interface StudioSurvey {
  readonly id: number;
  readonly uuid: string;
  readonly accessCode: string;
  readonly title: string;
  readonly description: string;
  readonly isHmsam: boolean;
  readonly isActive: boolean;
  readonly isDraft: boolean;
  readonly questionsCount: number;
  readonly responsesCount: number;
  readonly createdAt: string;
}

export interface StudioQuestionPayload {
  readonly text: string;
  readonly code?: string;
  readonly type: 'likert' | 'mcq' | 'checkbox' | 'dropdown' | 'short' | 'open' | 'rating' | 'date';
  readonly construct?: string;
  readonly required?: boolean;
  readonly ratingMax?: number;
  readonly ratingStyle?: string;
  readonly sectionTitle?: string;
  readonly options?: string[];
}

export interface CreateSurveyPayload {
  readonly title: string;
  readonly description?: string;
  readonly is_hmsam?: boolean;
  readonly is_draft?: boolean;
  readonly features?: Record<string, unknown>;
  readonly questions: StudioQuestionPayload[];
}

export interface ICreatorStudioPort {
  listSurveys(): Promise<StudioSurvey[]>;
  createSurvey(payload: CreateSurveyPayload): Promise<{
    ok: boolean;
    uuid: string;
    accessCode: string;
    surveyId: number;
    questionsCount: number;
    isDraft?: boolean;
    isActive?: boolean;
  }>;
  togglePublish?(uuid: string, isDraft?: boolean): Promise<{
    ok: boolean;
    uuid: string;
    accessCode: string;
    isDraft: boolean;
    isActive: boolean;
    status: 'draft' | 'published';
  }>;
  updateSurveyPolicy?(uuid: string, features: Record<string, unknown>): Promise<void>;
}
