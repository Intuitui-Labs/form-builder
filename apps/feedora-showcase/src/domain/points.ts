import { DEFAULT_POINTS, type SurveyFeatures } from './types';

const NON_SCORING_FIELDS = new Set(['heading', 'divider', 'paragraph']);

/** Maps an engine field type onto her Question.question_type points bucket. */
export function questionTypeForEngineField(fieldType: string): string | null {
  if (NON_SCORING_FIELDS.has(fieldType)) return null;
  switch (fieldType) {
    case 'likert':
      return 'likert';
    case 'slider':
    case 'number':
      return 'rating';
    case 'select':
    case 'radio':
      return 'mcq';
    case 'multiselect':
    case 'checkbox':
      return 'checkbox';
    case 'textarea':
      return 'open';
    case 'text':
      return 'short';
    case 'date':
      return 'date';
    case 'file':
      return 'file';
    default:
      return 'likert';
  }
}

/**
 * Points for a single answered question, exactly as `surveys/views.py pts()`:
 * only when points are enabled, custom values override the per-type default,
 * and a short/open answer longer than 20 chars earns the `open` value.
 */
export function pointsForAnswer(
  features: SurveyFeatures,
  fieldType: string,
  value: unknown,
): number {
  if (!features.points.enabled) return 0;

  const qtype = questionTypeForEngineField(fieldType);
  if (!qtype) return 0;

  const values = features.points.values;
  let base = values[qtype] ?? DEFAULT_POINTS[qtype] ?? 10;

  if ((qtype === 'short' || qtype === 'open') && String(value).length > 20) {
    base = values.open ?? DEFAULT_POINTS.open ?? 20;
  }

  return base;
}
