import type {
  FieldType,
  FormField,
  FormFieldOption,
  FormPage,
  FormSchema,
} from '@intuitui-labs/form-builder-engine';
import type { RemoteSurveyMeta, RemoteSurveyQuestion } from './ports/transportTypes';

/**
 * Transforms any arbitrary Django survey metadata fetched from
 * GET /surveys/respond/<uuid>/meta/ or GET /api/v1/surveys/<uuid>/
 * into an executable, validated FormSchema for MultiStepFormManager.
 */
export function convertRemoteSurveyToSchema(meta: RemoteSurveyMeta): FormSchema {
  const { survey, questions, features } = meta;

  // 1. Cover / welcome page
  const coverPage: FormPage = {
    id: 'welcome',
    title: survey.title,
    role: 'cover',
    description:
      survey.description ||
      'Your responses contribute to ongoing research. Answers are recorded and scored in real-time.',
    badge: survey.is_hmsam ? 'HMSAM RESEARCH' : `SURVEY · ${questions.length} QUESTIONS`,
    fields: [],
  };

  // 2. Question to FormField mapper
  const toFormField = (q: RemoteSurveyQuestion, index: number): FormField => {
    const fieldId = q.code || `q_${q.id}`;
    let fieldType: FieldType = 'likert';
    let options: FormFieldOption[] | undefined = undefined;
    let min = 1;
    let max = q.ratingMax || 5;
    let helperText: string | undefined = undefined;
    let placeholder: string | undefined = undefined;

    switch (q.type) {
      case 'likert':
      case 'rating':
        fieldType = 'likert';
        min = 1;
        max = q.ratingMax || 5;
        helperText = `1 = Strongly Disagree · ${max} = Strongly Agree`;
        break;

      case 'mcq':
      case 'dropdown':
      case 'checkbox':
        fieldType = 'select';
        options = (q.options || []).map((opt) => ({
          label: opt.text,
          value: String(opt.id),
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
    };
  };

  // 3. Partition questions into multi-step pages
  const sectionMap = new Map<string, RemoteSurveyQuestion[]>();
  for (const q of questions) {
    const sectionName =
      q.sectionTitle?.trim() ||
      (q.sectionNum ? `Section ${q.sectionNum}` : '') ||
      q.construct?.trim() ||
      'General Questions';

    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, []);
    }
    sectionMap.get(sectionName)!.push(q);
  }

  const questionPages: FormPage[] = [];

  // If there's only one big group with > 6 questions, paginate in friendly chunks of 5
  if (sectionMap.size === 1 && questions.length > 6) {
    const [sectionName, qList] = Array.from(sectionMap.entries())[0]!;
    const chunkSize = 5;
    for (let i = 0; i < qList.length; i += chunkSize) {
      const chunk = qList.slice(i, i + chunkSize);
      const pageNum = Math.floor(i / chunkSize) + 1;
      const totalPages = Math.ceil(qList.length / chunkSize);

      questionPages.push({
        id: `page-${pageNum}`,
        title: `${sectionName} (${pageNum}/${totalPages})`,
        description: `Questions ${i + 1} to ${Math.min(i + chunkSize, qList.length)} of ${qList.length}`,
        badge: `PART ${pageNum}`,
        fields: chunk.map((q, idx) => toFormField(q, idx)),
      });
    }
  } else {
    let pIdx = 1;
    for (const [sectionName, qList] of sectionMap.entries()) {
      questionPages.push({
        id: `section-${pIdx}`,
        title: sectionName,
        description: `${qList.length} items · Section ${pIdx}`,
        badge: `SECTION ${pIdx}`,
        fields: [
          {
            id: `sec-${pIdx}-heading`,
            name: `sec-${pIdx}-heading`,
            type: 'heading',
            label: sectionName,
            required: false,
            order: 0,
          },
          ...qList.map((q, idx) => toFormField(q, idx)),
        ],
      });
      pIdx++;
    }
  }

  const kind = survey.is_hmsam
    ? 'survey'
    : survey.title.toLowerCase().includes('quiz')
    ? 'quiz'
    : 'survey';

  return {
    id: survey.uuid || `survey-${survey.id}`,
    kind,
    accessPolicy: {
      allowRedo: kind === 'quiz',
      maxAttempts: kind === 'quiz' ? undefined : 1,
      rewardStrategy: kind === 'quiz' ? 'score_delta' : 'first_attempt_only',
    },
    title: survey.title,
    description: survey.description || '',
    pages: [coverPage, ...questionPages],
    settings: {
      isPublished: true,
      category: 'research',
      slug: survey.access_code || `survey-${survey.id}`,
      showProgressBar: true,
      confirmationMessage: 'Thank you — your responses have been recorded in the research database.',
      gamification: features || {},
    },
  };
}
