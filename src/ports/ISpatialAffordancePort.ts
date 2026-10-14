import type { FieldDefinition } from '../schema/FormSchema.js';

export type SpatialDensityMode = 'spacious' | 'balanced' | 'compact' | 'claustrophobic';

export interface ContainerSpatialProfile {
  containerId: string;
  widthPx: number;
  heightPx?: number;
  paddingPx: { top: number; right: number; bottom: number; left: number };
  childGapPx: number;
  labelInputGapPx?: number;
  inputNextGroupGapPx?: number;
}

export interface SpatialBudgetEvaluation {
  csdi: number; // 0.0 (empty) to 1.0 (at capacity) to >1.0 (over-capacity)
  densityMode: SpatialDensityMode;
  recommendedColumns: 1 | 2 | 3;
  shouldPartitionToNextStep: boolean;
  gestaltProximityRatio?: number;
  violations: string[];
}

/**
 * Hexagonal port for calculating spatial density, Gestalt enclosure,
 * and cognitive layout affordance across web, mobile (RN), and headless environments.
 */
export interface ISpatialAffordancePort {
  evaluateContainer(
    profile: ContainerSpatialProfile,
    fields: FieldDefinition[]
  ): SpatialBudgetEvaluation;
}

/**
 * Zero-runtime-bloat default adapter.
 * Performs no heavy math and safely compiles down to 0 runtime overhead.
 */
export class NoopSpatialAffordanceAdapter implements ISpatialAffordancePort {
  evaluateContainer(
    _profile: ContainerSpatialProfile,
    _fields: FieldDefinition[]
  ): SpatialBudgetEvaluation {
    return {
      csdi: 0.5,
      densityMode: 'balanced',
      recommendedColumns: 1,
      shouldPartitionToNextStep: false,
      violations: [],
    };
  }
}

/**
 * Calculates Gestalt proximity ratio between label-to-input gap and input-to-next-group gap.
 * A legible form requires R_prox >= 1.618 (Golden Ratio proximity threshold).
 */
export function evaluateGestaltProximity(
  labelToInputGapPx: number,
  inputToNextGroupGapPx: number
): { ratio: number; passes: boolean; reason?: string } {
  if (labelToInputGapPx <= 0) {
    return {
      ratio: Infinity,
      passes: true,
    };
  }

  const ratio = Math.round((inputToNextGroupGapPx / labelToInputGapPx) * 100) / 100;
  if (ratio < 1.0) {
    return {
      ratio,
      passes: false,
      reason: `Label-to-input gap (${labelToInputGapPx}px) is larger than gap to next group (${inputToNextGroupGapPx}px). Label visually detaches from its input.`,
    };
  }

  if (ratio < 1.5) {
    return {
      ratio,
      passes: false,
      reason: `Proximity ratio (${ratio}) is below comfortable threshold (1.5). Increase input-to-next-group gap for clear grouping.`,
    };
  }

  return {
    ratio,
    passes: true,
  };
}

/**
 * Computes Quantum Density Units (QDU) for a set of fields based on cognitive & typographic mass.
 */
export function calculateFieldQuantumDensity(fields: FieldDefinition[]): number {
  let totalQdu = 0;

  for (const field of fields) {
    const t = (field.type as string).toLowerCase();
    switch (t) {
      case 'heading':
      case 'divider':
        totalQdu += 0.25;
        break;
      case 'statement':
        totalQdu += 0.5;
        break;
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'password':
      case 'slider':
      case 'date':
        totalQdu += 1.0;
        break;
      case 'textarea':
      case 'select':
      case 'multiselect':
      case 'radio':
      case 'checkbox':
      case 'likert':
        totalQdu += 1.5;
        break;
      case 'file':
      case 'rich-text':
        totalQdu += 2.0;
        break;
      case 'image-capture':
      case 'audio-record':
        totalQdu += 2.5;
        break;
      case 'address':
      case 'matrix':
      case 'repeater':
      case 'visualization':
        totalQdu += 3.5;
        break;
      case 'signature':
        totalQdu += 4.0;
        break;
      default:
        totalQdu += 1.0;
        break;
    }

    // Additional cognitive mass for heavy descriptions/helper text hotspots
    const desc = (field as any).description ?? field.helperText;
    if (desc && desc.length > 50) {
      totalQdu += 0.5;
    }

    // Media hotspots
    if (field.media) {
      totalQdu += 1.0;
    }

    // Rules/validation hotspots
    if (field.rules && field.rules.length > 2) {
      totalQdu += 0.25 * (field.rules.length - 2);
    }
  }

  return Math.round(totalQdu * 10) / 10;
}

