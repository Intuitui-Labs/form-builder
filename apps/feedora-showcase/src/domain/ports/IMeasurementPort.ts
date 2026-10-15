import type {
  MeasurementReport,
  OverallInterpretation,
  ReliabilityReport,
} from './measurementTypes';

/**
 * Application-level port (downstream of the engine): converts a raw response
 * into a psychometric report for a named instrument (here, HMSAM).
 *
 * The engine models correctness (IAssessmentPort) and reward (IRewardEnginePort);
 * it deliberately has no opinion on construct validity or reliability. That is
 * this app's domain, so it is defined here as its own port rather than leaking
 * research vocabulary into the engine's upstream ports.
 */
export interface IMeasurementPort {
  readonly instrument: string;
  readonly instrumentVersion: string;
  readonly constructCount: number;
  readonly itemCount: number;

  /** Score a single response into per-construct scores + overall adoption %. */
  score(values: Record<string, unknown>): MeasurementReport;

  /** her get_overall_interpretation(overall). */
  interpretOverall(overall: number): OverallInterpretation;

  /**
   * Cronbach's alpha across a matrix of responses (one row per respondent).
   * Needs >= 2 complete responses; below that returns sampleTooSmall.
   */
  computeReliability(responses: Record<string, number>[]): ReliabilityReport;
}
