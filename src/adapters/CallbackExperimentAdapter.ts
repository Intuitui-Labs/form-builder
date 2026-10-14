import type {
  ExperimentContext,
  FlagResolutionDetails,
  IExperimentPort,
} from '../ports/IExperimentPort.js';

export interface CallbackExperimentHooks {
  isEnabled?: (flagKey: string, context: ExperimentContext) => boolean;
  getVariant?: <T = string>(experimentKey: string, context: ExperimentContext, defaultValue: T) => T;
  resolveDetails?: <T = string>(flagKey: string, context: ExperimentContext, defaultValue: T) => FlagResolutionDetails<T>;
  trackExposure?: (experimentKey: string, variantId: string, context: ExperimentContext) => void;
}

/**
 * Universal Callback / Lambda Adapter for Feature Flags & Experiments
 * Enables 3-line bridging to Vercel Flags SDK, Statsig, GrowthBook, PostHog, LaunchDarkly, or OpenFeature.
 */
export class CallbackExperimentAdapter implements IExperimentPort {
  readonly name: string;
  private hooks: CallbackExperimentHooks;

  constructor(hooks: CallbackExperimentHooks, name = 'CallbackExperimentAdapter') {
    this.name = name;
    this.hooks = hooks;
  }

  isEnabled(flagKey: string, context: ExperimentContext, defaultValue = false): boolean {
    if (this.hooks.isEnabled) {
      try {
        return this.hooks.isEnabled(flagKey, context);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  }

  getVariant<T = string>(experimentKey: string, context: ExperimentContext, defaultValue: T): T {
    if (this.hooks.getVariant) {
      try {
        return this.hooks.getVariant(experimentKey, context, defaultValue);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  }

  resolveDetails<T = string>(
    flagKey: string,
    context: ExperimentContext,
    defaultValue: T,
  ): FlagResolutionDetails<T> {
    if (this.hooks.resolveDetails) {
      try {
        return this.hooks.resolveDetails(flagKey, context, defaultValue);
      } catch (err) {
        return {
          value: defaultValue,
          variant: String(defaultValue),
          reason: 'ERROR',
          errorCode: 'GENERAL',
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const val = this.getVariant<T>(flagKey, context, defaultValue);
    return {
      value: val,
      variant: String(val),
      reason: 'CACHED',
    };
  }

  trackExposure(experimentKey: string, variantId: string, context: ExperimentContext): void {
    if (this.hooks.trackExposure) {
      try {
        this.hooks.trackExposure(experimentKey, variantId, context);
      } catch (err) {
        // Defensive: exposure tracking failures should never crash the form flow
        console.warn(`[${this.name}] trackExposure failed for ${experimentKey}:`, err);
      }
    }
  }
}
