import type {
  FormSchema,
  FormPage,
  FormField,
  FormFieldOption,
  FieldType,
  FormKind,
  FormAccessPolicy,
} from './FormSchema.js';
import { BatteryEngine } from '../battery/BatteryEngine.js';

export interface ExternalQuestionOption {
  readonly id?: string | number;
  readonly text?: string;
  readonly label?: string;
  readonly value?: string | number;
}

export interface ExternalQuestion {
  readonly id: string | number;
  readonly code?: string;
  readonly text: string;
  readonly type?:
    | 'likert'
    | 'rating'
    | 'mcq'
    | 'dropdown'
    | 'checkbox'
    | 'open'
    | 'short'
    | 'date'
    | 'file'
    | string;
  readonly required?: boolean;
  readonly ratingMax?: number;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly ExternalQuestionOption[];
  readonly construct?: string;
  readonly constructLabel?: string;
  readonly sectionTitle?: string;
  readonly sectionNum?: number | string;
}

export interface ExternalSurveyInput {
  readonly id?: string | number;
  readonly uuid?: string;
  readonly title: string;
  readonly description?: string;
  readonly kind?: FormKind;
  readonly access_code?: string;
  readonly is_hmsam?: boolean;
  readonly accessPolicy?: FormAccessPolicy;
  readonly access_policy?: Record<string, unknown>;
  readonly allow_multiple_submissions?: boolean;
  readonly allowRedo?: boolean;
  readonly maxAttempts?: number;
  readonly max_attempts?: number;
  readonly rewardStrategy?: FormAccessPolicy['rewardStrategy'];
  readonly reward_strategy?: string;
  readonly cooldownMinutes?: number;
  readonly cooldown_minutes?: number;
  readonly prerequisiteIds?: string[];
  readonly minScorePercent?: number;
  readonly unlockDelayMs?: number;
  readonly questions: readonly ExternalQuestion[];
  readonly features?: Record<string, unknown>;
  readonly includeCoverPage?: boolean;
  readonly maxQuestionsPerPage?: number;
}

/**
 * Enterprise Question-to-Schema Ingestion Pipeline.
 * Transforms external REST API / CMS survey payloads into executable, validated FormSchema structures.
 * Zero external runtime dependencies.
 */
export class SurveySchemaConverter {
  /**
   * Converts an external survey or questionnaire payload into a compliant FormSchema.
   */
  public static convert(input: ExternalSurveyInput): FormSchema {
    const {
      questions,
      title,
      description = '',
      includeCoverPage = true,
      maxQuestionsPerPage = 5,
    } = input;

    const formId = String(input.uuid || input.id || `survey_${Date.now()}`);

    // 1. Resolve FormKind
    const kind: FormKind =
      input.kind ??
      (input.is_hmsam
        ? 'survey'
        : title.toLowerCase().includes('quiz')
        ? 'quiz'
        : 'survey');

    // 2. Question to FormField mapper
    const toFormField = (q: ExternalQuestion, index: number): FormField => {
      const fieldId = q.code || (q.id !== undefined ? `q_${q.id}` : `f_${index + 1}`);
      let fieldType: FieldType = 'likert';
      let options: FormFieldOption[] | undefined;
      let min = q.min ?? 1;
      let max = q.max ?? q.ratingMax ?? 5;
      let helperText: string | undefined;
      let placeholder: string | undefined;

      switch (q.type) {
        case 'likert':
        case 'rating':
          fieldType = 'likert';
          min = q.min ?? 1;
          max = q.max ?? q.ratingMax ?? 5;
          helperText = `1 = Strongly Disagree · ${max} = Strongly Agree`;
          break;

        case 'mcq':
        case 'dropdown':
        case 'checkbox':
          fieldType = 'select';
          options = (q.options || []).map((opt) => ({
            label: opt.text || opt.label || String(opt.value ?? opt.id ?? ''),
            value: String(opt.value ?? opt.id ?? opt.text ?? ''),
          }));
          break;

        case 'open':
          fieldType = 'textarea';
          placeholder = 'Type your answer here…';
          break;

        case 'short':
        case 'date':
        case 'file':
        default:
          fieldType = 'text';
          placeholder = 'Your answer';
          break;
      }

      return {
        id: fieldId,
        name: fieldId,
        type: fieldType,
        label: q.text,
        required: Boolean(q.required),
        order: index + 1,
        min,
        max,
        scaleType: 'numeric',
        helperText,
        placeholder,
        options,
        // Psychometric construct annotations
        construct: q.construct,
        constructLabel: q.constructLabel,
      } as FormField;
    };

    // 3. Partition questions by section
    const sectionMap = new Map<string, ExternalQuestion[]>();
    for (const q of questions) {
      const sectionName =
        q.sectionTitle?.trim() ||
        (q.sectionNum !== undefined ? `Section ${q.sectionNum}` : '') ||
        q.construct?.trim() ||
        'General Questions';

      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, []);
      }
      sectionMap.get(sectionName)!.push(q);
    }

    const questionPages: FormPage[] = [];

    // Paginate in friendly chunks if there is only 1 section and more questions than threshold
    if (sectionMap.size === 1 && questions.length > maxQuestionsPerPage + 1) {
      const [sectionName, qList] = Array.from(sectionMap.entries())[0]!;
      const chunkSize = maxQuestionsPerPage;
      for (let i = 0; i < qList.length; i += chunkSize) {
        const chunk = qList.slice(i, i + chunkSize);
        const pageNum = Math.floor(i / chunkSize) + 1;
        const totalPages = Math.ceil(qList.length / chunkSize);

        questionPages.push({
          id: `page_${pageNum}`,
          title: `${sectionName} (${pageNum}/${totalPages})`,
          description: `Questions ${i + 1} to ${Math.min(i + chunkSize, qList.length)} of ${qList.length}`,
          badge: `PART ${pageNum}`,
          fields: chunk.map((q, idx) => toFormField(q, i + idx)),
        });
      }
    } else {
      let pIdx = 1;
      for (const [sectionName, qList] of sectionMap.entries()) {
        questionPages.push({
          id: `section_${pIdx}`,
          title: sectionName,
          description: `${qList.length} items · Section ${pIdx}`,
          badge: `SECTION ${pIdx}`,
          fields: qList.map((q, idx) => toFormField(q, idx)),
        });
        pIdx++;
      }
    }

    // 4. Resolve Access Policy
    const fallbackPolicy = BatteryEngine.getDefaultAccessPolicy(kind);
    const explicitPolicy = input.accessPolicy || (input.access_policy as Record<string, unknown> | undefined);

    const hasLegacyRedo =
      input.allow_multiple_submissions !== undefined || input.allowRedo !== undefined;
    const legacyAllowRedo = Boolean(input.allow_multiple_submissions || input.allowRedo);

    const explicitAllowRedo = explicitPolicy?.allowRedo ?? (explicitPolicy as any)?.allow_redo;
    const allowRedo = explicitAllowRedo !== undefined
      ? Boolean(explicitAllowRedo)
      : hasLegacyRedo
      ? legacyAllowRedo
      : fallbackPolicy.allowRedo;

    const rawMax =
      input.maxAttempts ??
      input.max_attempts ??
      explicitPolicy?.maxAttempts ??
      (explicitPolicy as any)?.max_attempts;

    const maxAttempts =
      rawMax !== undefined && rawMax !== null
        ? Number(rawMax)
        : allowRedo
        ? undefined
        : 1;

    const rawStrategy =
      input.rewardStrategy ??
      input.reward_strategy ??
      explicitPolicy?.rewardStrategy ??
      (explicitPolicy as any)?.reward_strategy;

    const cooldownMin =
      input.cooldownMinutes ??
      input.cooldown_minutes ??
      explicitPolicy?.cooldownMinutes ??
      (explicitPolicy as any)?.cooldown_minutes;

    const accessPolicy: FormAccessPolicy = {
      allowRedo,
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts! > 0 ? maxAttempts : (allowRedo ? undefined : 1),
      rewardStrategy: (rawStrategy ?? fallbackPolicy.rewardStrategy) as FormAccessPolicy['rewardStrategy'],
      ...(Number.isFinite(Number(cooldownMin)) ? { cooldownMinutes: Number(cooldownMin) } : {}),
      version: (explicitPolicy as any)?.version ? String((explicitPolicy as any).version) : undefined,
    };

    // 5. Construct Cover Page if requested
    const pages: FormPage[] = [];
    if (includeCoverPage) {
      pages.push({
        id: 'welcome',
        title,
        role: 'cover',
        description: description || 'Answers are recorded in real-time.',
        badge: input.is_hmsam ? 'RESEARCH' : `SURVEY · ${questions.length} QUESTIONS`,
        fields: [],
      });
    }
    pages.push(...questionPages);

    return {
      id: formId,
      kind,
      title,
      description,
      accessPolicy,
      ...(input.prerequisiteIds?.length || input.minScorePercent !== undefined
        ? {
            prerequisites: {
              completedFormIds: input.prerequisiteIds,
              minScorePercent: input.minScorePercent,
              unlockDelayMs: input.unlockDelayMs,
            },
          }
        : {}),
      pages,
      settings: {
        isPublished: true,
        category: 'research',
        slug: input.access_code || formId,
        showProgressBar: true,
        gamification: input.features || {},
      },
    };
  }
}
