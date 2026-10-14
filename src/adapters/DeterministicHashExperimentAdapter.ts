import type {
  ExperimentContext,
  FlagResolutionDetails,
  IExperimentPort,
} from '../ports/IExperimentPort.js';
import type { RecordedExposure } from './MemoryExperimentAdapter.js';

export interface WeightedVariant<T = string> {
  id: string;
  weight: number; // e.g. 50 (percentage 0..100)
  value?: T;
}

export interface ExperimentDefinition<T = string> {
  experimentKey: string;
  variants: WeightedVariant<T>[];
  defaultVariant: string;
  salt?: string;
  targeting?: (context: ExperimentContext) => boolean;
}

export interface DeterministicHashOptions {
  salt?: string;
  experiments?: ExperimentDefinition[];
  onExposure?: (exposure: RecordedExposure) => void;
}

/**
 * 32-bit FNV-1a hash algorithm for cryptographically uniform deterministic bucketing
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Consistent Hash-Based Experiment & Feature Flag Adapter
 * Assigns users into stable 0..99 percentage buckets completely offline with 0 dependencies.
 * Supports per-experiment cryptographic salts and deterministic QA/developer test overrides.
 */
export class DeterministicHashExperimentAdapter implements IExperimentPort {
  readonly name = 'DeterministicHashExperimentAdapter';

  private salt: string;
  private experiments: Map<string, ExperimentDefinition>;
  private exposures: RecordedExposure[] = [];
  private overrides: Map<string, string> = new Map();
  private onExposure?: (exposure: RecordedExposure) => void;

  constructor(options: DeterministicHashOptions = {}) {
    this.salt = options.salt ?? 'form-builder-salt';
    this.experiments = new Map((options.experiments ?? []).map((e) => [e.experimentKey, e]));
    this.onExposure = options.onExposure;
  }

  overrideVariant(experimentKey: string, variantId: string): void {
    this.overrides.set(experimentKey, variantId);
  }

  clearOverrides(): void {
    this.overrides.clear();
  }

  registerExperiment(definition: ExperimentDefinition): void {
    this.experiments.set(definition.experimentKey, definition);
  }

  private resolveIdentifier(context: ExperimentContext): string {
    return context.userId ?? context.sessionId ?? 'anonymous';
  }

  getBucket(experimentKey: string, context: ExperimentContext): number {
    const exp = this.experiments.get(experimentKey);
    const id = this.resolveIdentifier(context);
    const activeSalt = exp?.salt ?? this.salt;
    const seed = `${activeSalt}:${experimentKey}:${id}`;
    return fnv1a32(seed) % 100;
  }

  isEnabled(flagKey: string, context: ExperimentContext, defaultValue = false): boolean {
    const exp = this.experiments.get(flagKey);
    if (!exp) return defaultValue;

    if (exp.targeting && !exp.targeting(context)) {
      return false;
    }

    const variant = this.getVariant(flagKey, context, exp.defaultVariant);
    return variant !== exp.defaultVariant && variant !== 'control' && variant !== 'off';
  }

  getVariant<T = string>(experimentKey: string, context: ExperimentContext, defaultValue: T): T {
    const exp = this.experiments.get(experimentKey);

    // 1. Check QA / developer override
    if (this.overrides.has(experimentKey)) {
      const overrideId = this.overrides.get(experimentKey)!;
      const matched = exp?.variants.find((v) => v.id === overrideId);
      return (matched?.value !== undefined ? (matched.value as unknown as T) : (overrideId as unknown as T));
    }

    if (!exp) return defaultValue;

    if (exp.targeting && !exp.targeting(context)) {
      return (exp.defaultVariant as unknown as T) ?? defaultValue;
    }

    const totalWeight = exp.variants.reduce((acc, v) => acc + v.weight, 0);
    if (totalWeight <= 0) {
      return (exp.defaultVariant as unknown as T) ?? defaultValue;
    }

    const bucket = this.getBucket(experimentKey, context);
    let cumulative = 0;

    for (const v of exp.variants) {
      const normalizedWeight = (v.weight / totalWeight) * 100;
      cumulative += normalizedWeight;
      if (bucket < cumulative) {
        return (v.value !== undefined ? v.value : v.id) as unknown as T;
      }
    }

    return (exp.defaultVariant as unknown as T) ?? defaultValue;
  }

  resolveDetails<T = string>(
    flagKey: string,
    context: ExperimentContext,
    defaultValue: T,
  ): FlagResolutionDetails<T> {
    if (this.overrides.has(flagKey)) {
      const overrideId = this.overrides.get(flagKey)!;
      const exp = this.experiments.get(flagKey);
      const matched = exp?.variants.find((v) => v.id === overrideId);
      const val = (matched?.value !== undefined ? matched.value : overrideId) as unknown as T;
      return {
        value: val,
        variant: overrideId,
        reason: 'OVERRIDE',
      };
    }

    const exp = this.experiments.get(flagKey);
    if (!exp) {
      return {
        value: defaultValue,
        variant: String(defaultValue),
        reason: 'DEFAULT',
        errorCode: 'FLAG_NOT_FOUND',
      };
    }

    if (exp.targeting && !exp.targeting(context)) {
      const defVal = (exp.defaultVariant as unknown as T) ?? defaultValue;
      return {
        value: defVal,
        variant: exp.defaultVariant,
        reason: 'DEFAULT',
      };
    }

    const val = this.getVariant<T>(flagKey, context, defaultValue);
    return {
      value: val,
      variant: String(val),
      reason: 'SPLIT',
    };
  }

  trackExposure(experimentKey: string, variantId: string, context: ExperimentContext): void {
    const record: RecordedExposure = {
      experimentKey,
      variantId,
      context,
      timestamp: new Date().toISOString(),
    };
    this.exposures.push(record);
    if (this.onExposure) {
      this.onExposure(record);
    }
  }

  getRecordedExposures(): readonly RecordedExposure[] {
    return [...this.exposures];
  }
}
