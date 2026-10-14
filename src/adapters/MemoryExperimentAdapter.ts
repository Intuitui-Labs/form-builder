import type {
  ExperimentContext,
  FlagResolutionDetails,
  IExperimentPort,
} from '../ports/IExperimentPort.js';

export interface RecordedExposure {
  experimentKey: string;
  variantId: string;
  context: ExperimentContext;
  timestamp: string;
}

export interface MemoryExperimentOptions {
  flags?: Record<string, boolean>;
  variants?: Record<string, unknown>;
  onExposure?: (exposure: RecordedExposure) => void;
}

/**
 * In-Memory Feature Flag & Experiment Adapter
 * Designed for local development, deterministic unit testing, and static flag bags.
 */
export class MemoryExperimentAdapter implements IExperimentPort {
  readonly name = 'MemoryExperimentAdapter';

  private flags: Map<string, boolean>;
  private variants: Map<string, unknown>;
  private exposures: RecordedExposure[] = [];
  private onExposure?: (exposure: RecordedExposure) => void;

  constructor(options: MemoryExperimentOptions = {}) {
    this.flags = new Map(Object.entries(options.flags ?? {}));
    this.variants = new Map(Object.entries(options.variants ?? {}));
    this.onExposure = options.onExposure;
  }

  setFlag(key: string, value: boolean): void {
    this.flags.set(key, value);
  }

  setVariant(key: string, value: unknown): void {
    this.variants.set(key, value);
  }

  clear(): void {
    this.flags.clear();
    this.variants.clear();
    this.exposures = [];
  }

  isEnabled(flagKey: string, _context: ExperimentContext, defaultValue = false): boolean {
    if (this.flags.has(flagKey)) {
      return Boolean(this.flags.get(flagKey));
    }
    return defaultValue;
  }

  getVariant<T = string>(experimentKey: string, _context: ExperimentContext, defaultValue: T): T {
    if (this.variants.has(experimentKey)) {
      return this.variants.get(experimentKey) as T;
    }
    return defaultValue;
  }

  resolveDetails<T = string>(
    flagKey: string,
    context: ExperimentContext,
    defaultValue: T,
  ): FlagResolutionDetails<T> {
    if (this.variants.has(flagKey)) {
      const val = this.variants.get(flagKey) as T;
      return {
        value: val,
        variant: String(val),
        reason: 'STATIC',
      };
    }

    if (this.flags.has(flagKey)) {
      const val = this.flags.get(flagKey) as unknown as T;
      return {
        value: val,
        variant: String(val),
        reason: 'STATIC',
      };
    }

    return {
      value: defaultValue,
      variant: String(defaultValue),
      reason: 'DEFAULT',
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
