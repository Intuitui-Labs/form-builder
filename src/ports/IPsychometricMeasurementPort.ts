export interface PsychometricConstructDefinition {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly color?: string;
  readonly description?: string;
}

export interface PsychometricItemDefinition {
  readonly field: string;
  readonly constructId: string;
  readonly code?: string;
  readonly prompt?: string;
  readonly scaleMin?: number; // Default: 1
  readonly scaleMax?: number; // Default: 5
}

export interface ConstructScoreReport {
  readonly constructId: string;
  readonly label: string;
  readonly score: number; // 0-100 normalized score
  readonly rawPercentage: number;
  readonly mean: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly answeredCount: number;
  readonly totalItems: number;
  readonly distribution: number[]; // frequency count from scaleMin to scaleMax
  readonly interpretation: 'very_low' | 'low' | 'moderate' | 'high' | 'outstanding';
  readonly interpretationLabel: string;
}

export interface MultiConstructMeasurementReport {
  readonly instrument?: string;
  readonly overallScore: number; // 0-100
  readonly answeredItems: number;
  readonly totalItems: number;
  readonly completionPercent: number;
  readonly constructs: ConstructScoreReport[];
  readonly overallInterpretation: {
    readonly level: 'very_low' | 'low' | 'moderate' | 'high' | 'outstanding';
    readonly summary: string;
  };
}

export interface ConstructReliabilityResult {
  readonly constructId: string;
  readonly alpha: number;
  readonly interpretation: string;
  readonly sampleCount: number;
  readonly itemCount: number;
}

/**
 * Outbound Port: Contract for computing multi-construct psychometric measurement
 * and dimensional reliability reports for Likert and rating instruments.
 * Zero external runtime dependencies.
 */
export interface IPsychometricMeasurementPort {
  score(values: Record<string, unknown>): MultiConstructMeasurementReport;
  computeReliability(responseMatrices: Record<string, number[][]>): Record<string, ConstructReliabilityResult>;
}
