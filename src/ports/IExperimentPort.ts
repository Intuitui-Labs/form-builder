/**
 * Experiment & Feature Flagging Evaluation Context
 * Aligned with CNCF OpenFeature and modern flag providers (Vercel, Statsig, GrowthBook).
 */
export interface ExperimentContext {
  /**
   * Unique user identifier for deterministic bucketing & targeting.
   */
  userId?: string;

  /**
   * Ephemeral session identifier (useful for unauthenticated mobile/web sessions).
   */
  sessionId?: string;

  /**
   * Multi-tenant organization / tenant boundary.
   */
  tenantId?: string;

  /**
   * Country code or geographical region (e.g. 'US', 'DE').
   */
  country?: string;

  /**
   * Client device platform.
   */
  devicePlatform?: 'ios' | 'android' | 'web';

  /**
   * SemVer application release version.
   */
  appVersion?: string;

  /**
   * Arbitrary targeting attributes (e.g. plan: 'enterprise', betaTester: true).
   */
  attributes?: Record<string, string | number | boolean | null>;
}

/**
 * Reason explaining why a flag/variant resolved to its value.
 */
export type ResolutionReason =
  | 'STATIC'
  | 'DEFAULT'
  | 'TARGETING_MATCH'
  | 'SPLIT'
  | 'CACHED'
  | 'OVERRIDE'
  | 'ERROR';

/**
 * Standard resolution envelope for feature flag & experiment evaluations.
 */
export interface FlagResolutionDetails<T> {
  value: T;
  variant?: string;
  reason?: ResolutionReason;
  errorCode?: 'FLAG_NOT_FOUND' | 'TYPE_MISMATCH' | 'GENERAL';
  errorMessage?: string;
}

/**
 * Outbound Port: Contract for swappable feature flag & A/B testing providers.
 * Pure TypeScript contract with 0 external dependencies.
 */
export interface IExperimentPort {
  readonly name: string;

  /**
   * Synchronously evaluates a boolean feature flag.
   */
  isEnabled(flagKey: string, context: ExperimentContext, defaultValue?: boolean): boolean;

  /**
   * Synchronously resolves an assigned variant value or string identifier.
   */
  getVariant<T = string>(experimentKey: string, context: ExperimentContext, defaultValue: T): T;

  /**
   * Returns full resolution details including reason, variant ID, and error states.
   */
  resolveDetails<T = string>(flagKey: string, context: ExperimentContext, defaultValue: T): FlagResolutionDetails<T>;

  /**
   * Fires an exposure tracking event ONLY when the target field/step is actively presented to the user.
   */
  trackExposure?(experimentKey: string, variantId: string, context: ExperimentContext): void;

  /**
   * Overrides assigned variant for QA, preview testing, or development environments.
   */
  overrideVariant?(experimentKey: string, variantId: string): void;

  /**
   * Clears all manual QA / preview overrides.
   */
  clearOverrides?(): void;
}
