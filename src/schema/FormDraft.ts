/**
 * Serializable snapshot of an ongoing user form session.
 * Captures entered values, visited step history, completion checkpoints,
 * and active multi-path branch lineage for seamless restoration.
 */
export interface FormDraftSnapshot<T = Record<string, unknown>> {
  schemaId: string;
  schemaVersion: string;
  savedAt: string; // ISO 8601 string
  currentPageIndex: number;
  completedStepIndices: number[];
  stepHistory: number[];
  branchLineage: Array<[number, number[]]>; // Serializable representation of branchLineage Map
  branchTargetHistory: Array<[number, number]>; // Serializable representation of branchTargetHistory Map
  values: T;
  isSubmitted: boolean;
  redactedFields?: string[];
  experimentLineage?: {
    experimentKey: string;
    variantId: string;
  };
}
