import type {
  IPsychometricMeasurementPort,
  PsychometricConstructDefinition,
  PsychometricItemDefinition,
  ConstructScoreReport,
  MultiConstructMeasurementReport,
  ConstructReliabilityResult,
} from '../ports/IPsychometricMeasurementPort.js';
import type { FormSchema } from '../schema/FormSchema.js';

export interface ConstructMeasurementOptions {
  readonly instrument?: string;
  readonly constructs: PsychometricConstructDefinition[];
  readonly items: PsychometricItemDefinition[];
}

function round(val: number, decimals = 1): number {
  if (!Number.isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function getScoreInterpretation(score: number): {
  level: 'very_low' | 'low' | 'moderate' | 'high' | 'outstanding';
  label: string;
} {
  if (score >= 80) return { level: 'outstanding', label: 'Outstanding' };
  if (score >= 60) return { level: 'high', label: 'High' };
  if (score >= 40) return { level: 'moderate', label: 'Moderate' };
  if (score >= 20) return { level: 'low', label: 'Low' };
  return { level: 'very_low', label: 'Very Low' };
}

/**
 * Enterprise Multi-Construct Psychometric Measurement Engine.
 * Aggregates questionnaire responses across dimensional constructs, computes Likert distributions,
 * normalizes multidimensional scale scores, and performs Cronbach's alpha reliability analysis.
 * Zero external runtime dependencies.
 */
export class ConstructMeasurementEngine implements IPsychometricMeasurementPort {
  readonly instrument?: string;
  private readonly constructs: Map<string, PsychometricConstructDefinition>;
  private readonly items: PsychometricItemDefinition[];
  private readonly constructOrder: string[];

  constructor(options: ConstructMeasurementOptions) {
    this.instrument = options.instrument;
    this.constructs = new Map(options.constructs.map((c) => [c.id, c]));
    this.items = options.items;
    this.constructOrder = options.constructs.map((c) => c.id);
  }

  /**
   * Automatically introspects a FormSchema and constructs a measurement engine
   * from any fields having a `construct` tag.
   */
  public static fromSchema(schema: FormSchema, instrumentName?: string): ConstructMeasurementEngine {
    const constructMap = new Map<string, PsychometricConstructDefinition>();
    const items: PsychometricItemDefinition[] = [];

    for (const page of schema.pages) {
      for (const field of page.fields) {
        const constructId =
          (field as any).construct ||
          (field.config?.construct as string | undefined);

        if (constructId && typeof constructId === 'string') {
          const trimmedId = constructId.trim();
          if (!constructMap.has(trimmedId)) {
            constructMap.set(trimmedId, {
              id: trimmedId,
              label: (field as any).constructLabel || trimmedId.toUpperCase(),
            });
          }

          items.push({
            field: field.name,
            constructId: trimmedId,
            code: field.name,
            prompt: field.label,
            scaleMin: field.min ?? 1,
            scaleMax: field.max ?? 5,
          });
        }
      }
    }

    return new ConstructMeasurementEngine({
      instrument: instrumentName ?? schema.title,
      constructs: Array.from(constructMap.values()),
      items,
    });
  }

  public score(values: Record<string, unknown>): MultiConstructMeasurementReport {
    const reports: ConstructScoreReport[] = [];
    let totalAnsweredCount = 0;

    for (const constructId of this.constructOrder) {
      const constructDef = this.constructs.get(constructId);
      if (!constructDef) continue;

      const constructItems = this.items.filter((item) => item.constructId === constructId);
      if (constructItems.length === 0) continue;

      const collected: number[] = [];
      const minScale = constructItems[0]?.scaleMin ?? 1;
      const maxScale = constructItems[0]?.scaleMax ?? 5;
      const span = Math.max(1, maxScale - minScale);

      for (const item of constructItems) {
        const raw = values[item.field];
        if (raw === undefined || raw === null || raw === '') continue;
        const num = Number(raw);
        if (Number.isFinite(num)) {
          collected.push(num);
          totalAnsweredCount++;
        }
      }

      if (collected.length === 0) {
        reports.push({
          constructId,
          label: constructDef.label,
          score: 0,
          rawPercentage: 0,
          mean: 0,
          scaleMin: minScale,
          scaleMax: maxScale,
          answeredCount: 0,
          totalItems: constructItems.length,
          distribution: new Array(maxScale - minScale + 1).fill(0),
          interpretation: 'very_low',
          interpretationLabel: 'Not Answered',
        });
        continue;
      }

      const n = collected.length;
      const sum = collected.reduce((a, b) => a + b, 0);
      const mean = round(sum / n, 2);

      // Raw percentage against max scale
      const rawPercentage = round((sum / (maxScale * n)) * 100, 1);
      // Min-max normalized percentage (0-100)
      const normalizedScore = round(Math.max(0, Math.min(100, ((mean - minScale) / span) * 100)), 1);
      const finalScore = minScale === 1 && maxScale === 5 ? rawPercentage : normalizedScore;

      // Histogram distribution of answers across scale bins
      const distributionLen = Math.max(1, maxScale - minScale + 1);
      const distribution = Array.from({ length: distributionLen }, (_, idx) => {
        const targetValue = minScale + idx;
        return collected.filter((v) => v === targetValue).length;
      });

      const interpretation = getScoreInterpretation(finalScore);

      reports.push({
        constructId,
        label: constructDef.label,
        score: finalScore,
        rawPercentage,
        mean,
        scaleMin: minScale,
        scaleMax: maxScale,
        answeredCount: n,
        totalItems: constructItems.length,
        distribution,
        interpretation: interpretation.level,
        interpretationLabel: interpretation.label,
      });
    }

    const totalPossibleItems = this.items.length;
    const answeredReports = reports.filter((r) => r.answeredCount > 0);
    const overallScore = answeredReports.length > 0
      ? round(answeredReports.reduce((acc, r) => acc + r.score, 0) / answeredReports.length, 1)
      : 0;

    const completionPercent = totalPossibleItems > 0
      ? round((totalAnsweredCount / totalPossibleItems) * 100, 1)
      : 0;

    const overallInterpretationMeta = getScoreInterpretation(overallScore);

    return {
      instrument: this.instrument,
      overallScore,
      answeredItems: totalAnsweredCount,
      totalItems: totalPossibleItems,
      completionPercent,
      constructs: reports,
      overallInterpretation: {
        level: overallInterpretationMeta.level,
        summary: `Overall assessment score is ${overallScore}% (${overallInterpretationMeta.label}), based on ${totalAnsweredCount} of ${totalPossibleItems} answered questions.`,
      },
    };
  }

  public computeReliability(
    responseMatrices: Record<string, number[][]>,
  ): Record<string, ConstructReliabilityResult> {
    const results: Record<string, ConstructReliabilityResult> = {};

    for (const [constructId, matrix] of Object.entries(responseMatrices)) {
      results[constructId] = this.calculateConstructAlpha(constructId, matrix);
    }

    return results;
  }

  private calculateConstructAlpha(constructId: string, matrix: number[][]): ConstructReliabilityResult {
    const sampleCount = matrix.length;
    if (sampleCount < 2) {
      return {
        constructId,
        alpha: 0.0,
        interpretation: 'Insufficient sample count (need at least 2 responses)',
        itemCount: matrix[0]?.length ?? 0,
        sampleCount,
      };
    }

    const itemCount = matrix[0]!.length;
    if (itemCount < 2) {
      return {
        constructId,
        alpha: 0.0,
        interpretation: 'Insufficient items (need at least 2 questions in construct)',
        itemCount,
        sampleCount,
      };
    }

    // 1. Column variances with Bessel's correction
    let sumItemVariances = 0;
    for (let col = 0; col < itemCount; col++) {
      let colSum = 0;
      for (let row = 0; row < sampleCount; row++) {
        colSum += matrix[row]![col]!;
      }
      const colMean = colSum / sampleCount;

      let sqDiff = 0;
      for (let row = 0; row < sampleCount; row++) {
        const diff = matrix[row]![col]! - colMean;
        sqDiff += diff * diff;
      }
      sumItemVariances += sqDiff / (sampleCount - 1);
    }

    // 2. Total test score variance
    const totalScores: number[] = [];
    for (let row = 0; row < sampleCount; row++) {
      let rowSum = 0;
      for (let col = 0; col < itemCount; col++) {
        rowSum += matrix[row]![col]!;
      }
      totalScores.push(rowSum);
    }

    const totalMean = totalScores.reduce((a, b) => a + b, 0) / sampleCount;
    let totalSqDiff = 0;
    for (const score of totalScores) {
      const diff = score - totalMean;
      totalSqDiff += diff * diff;
    }
    const totalVariance = totalSqDiff / (sampleCount - 1);

    if (totalVariance <= 0) {
      return {
        constructId,
        alpha: 0.0,
        interpretation: 'Zero variance across respondents',
        itemCount,
        sampleCount,
      };
    }

    const rawAlpha = (itemCount / (itemCount - 1)) * (1 - (sumItemVariances / totalVariance));
    const alpha = round(Math.max(0, Math.min(1.0, rawAlpha)), 2);

    let interpretation = 'Unacceptable reliability (α < 0.5)';
    if (alpha >= 0.9) interpretation = 'Excellent reliability (α ≥ 0.9)';
    else if (alpha >= 0.8) interpretation = 'Good reliability (α ≥ 0.8)';
    else if (alpha >= 0.7) interpretation = 'Acceptable reliability (α ≥ 0.7)';
    else if (alpha >= 0.6) interpretation = 'Questionable reliability (α ≥ 0.6)';
    else if (alpha >= 0.5) interpretation = 'Poor reliability (α ≥ 0.5)';

    return {
      constructId,
      alpha,
      interpretation,
      itemCount,
      sampleCount,
    };
  }
}
