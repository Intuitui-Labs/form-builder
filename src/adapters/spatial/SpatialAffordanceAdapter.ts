import type { FieldDefinition } from '../../schema/FormSchema.js';
import {
  type ISpatialAffordancePort,
  type ContainerSpatialProfile,
  type SpatialBudgetEvaluation,
  type SpatialDensityMode,
  calculateFieldQuantumDensity,
  evaluateGestaltProximity,
} from '../../ports/ISpatialAffordancePort.js';

export interface SpatialAffordanceAdapterOptions {
  /** Maximum Quantum Density Units (QDU) allowed before container is deemed claustrophobic (default: 16) */
  maxQduPerContainer?: number;
  /** Viewport threshold to recommend 2 columns (default: 768px) */
  twoColumnMinWidthPx?: number;
  /** Viewport threshold to recommend 3 columns (default: 1200px) */
  threeColumnMinWidthPx?: number;
}

/**
 * Mathematical Spatial Affordance Evaluator.
 * Computes Gestalt enclosure, Proximity Ratios, and Cognitive & Spatial Density (CSDI).
 */
export class SpatialAffordanceAdapter implements ISpatialAffordancePort {
  private readonly maxQdu: number;
  private readonly twoColumnMinWidthPx: number;
  private readonly threeColumnMinWidthPx: number;

  constructor(options: SpatialAffordanceAdapterOptions = {}) {
    this.maxQdu = options.maxQduPerContainer ?? 16;
    this.twoColumnMinWidthPx = options.twoColumnMinWidthPx ?? 768;
    this.threeColumnMinWidthPx = options.threeColumnMinWidthPx ?? 1200;
  }

  evaluateContainer(
    profile: ContainerSpatialProfile,
    fields: FieldDefinition[]
  ): SpatialBudgetEvaluation {
    const violations: string[] = [];
    const minPadding = Math.min(
      profile.paddingPx.top,
      profile.paddingPx.right,
      profile.paddingPx.bottom,
      profile.paddingPx.left
    );

    // 1. Gestalt Enclosure: Container Padding >= Child Gap
    if (minPadding < profile.childGapPx) {
      violations.push(
        `Container "${profile.containerId}": inner padding (${minPadding}px) is smaller than child element gap (${profile.childGapPx}px), violating Gestalt enclosure.`
      );
    }

    // 2. Proximity Ratio: Dist(Label, Input) vs Dist(Input, NextGroup)
    let gestaltProximityRatio: number | undefined;
    if (
      profile.labelInputGapPx !== undefined &&
      profile.inputNextGroupGapPx !== undefined
    ) {
      const prox = evaluateGestaltProximity(
        profile.labelInputGapPx,
        profile.inputNextGroupGapPx
      );
      gestaltProximityRatio = prox.ratio;
      if (!prox.passes && prox.reason) {
        violations.push(prox.reason);
      }
    }

    // 3. Quantum Density Units & CSDI
    const totalQdu = calculateFieldQuantumDensity(fields);
    const rawCsdi = totalQdu / this.maxQdu;
    const csdi = Math.round(rawCsdi * 100) / 100;

    // 4. Density Mode determination
    let densityMode: SpatialDensityMode = 'balanced';
    if (csdi <= 0.4) {
      densityMode = 'spacious';
    } else if (csdi <= 0.75) {
      densityMode = 'balanced';
    } else if (csdi <= 1.0) {
      densityMode = 'compact';
    } else {
      densityMode = 'claustrophobic';
      violations.push(
        `Container "${profile.containerId}" density index (${csdi}) exceeds capacity (${this.maxQdu} QDU budget). User cognitive fatigue is highly probable.`
      );
    }

    // 5. Recommended Columns
    let recommendedColumns: 1 | 2 | 3 = 1;
    if (profile.widthPx >= this.threeColumnMinWidthPx && fields.length >= 6) {
      recommendedColumns = 3;
    } else if (profile.widthPx >= this.twoColumnMinWidthPx && fields.length >= 4) {
      recommendedColumns = 2;
    }

    // 6. Step Partitioning recommendation
    const shouldPartitionToNextStep = csdi > 1.0 || fields.length > 12;

    return {
      csdi,
      densityMode,
      recommendedColumns,
      shouldPartitionToNextStep,
      gestaltProximityRatio,
      violations,
    };
  }
}
