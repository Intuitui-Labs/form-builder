import type { FormSchema } from '../schema/FormSchema.js';
import type { FormDraftSnapshot } from '../schema/FormDraft.js';
import type { ExperimentContext, IExperimentPort } from '../ports/IExperimentPort.js';
import { FormHydrator, type HydrationOptions } from './FormHydrator.js';
import { FormManager } from '../manager/FormManager.js';
import { MultiStepFormManager, type MultiStepFormOptions } from '../manager/MultiStepFormManager.js';

import type { ITelemetryPort } from '../ports/ITelemetryPort.js';

export interface ExperimentLineage {
  experimentKey: string;
  variantId: string;
}

export interface SelectSchemaOptions {
  experimentKey: string;
  variants: Record<string, FormSchema>;
  defaultVariant?: string;
  experimentPort: IExperimentPort;
  context: ExperimentContext;
}

export interface PatchSchemaOptions {
  experimentKey: string;
  baseSchema: FormSchema;
  patches: Record<string, Partial<FormSchema> | ((base: FormSchema) => FormSchema)>;
  defaultVariant?: string;
  experimentPort: IExperimentPort;
  context: ExperimentContext;
}

export interface ExperimentHydrateOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  experimentKey: string;
  variants?: Record<string, FormSchema>;
  baseSchema?: FormSchema;
  patches?: Record<string, Partial<FormSchema> | ((base: FormSchema) => FormSchema)>;
  defaultVariant?: string;
  experimentPort: IExperimentPort;
  context: ExperimentContext;
  onSubmit: (values: T) => Promise<void> | void;
  isMultiStep?: boolean;
  multiStepOptions?: MultiStepFormOptions<T>;
  hydrationOptions?: HydrationOptions;
  /**
   * Optional telemetry sink for in-flight funnel, friction and conversion telemetry.
   */
  telemetry?: ITelemetryPort;
  /**
   * If true, fires trackExposure immediately upon hydration/mount.
   * If false, exposure tracking must be triggered explicitly via result.trackExposure().
   * Default is false (best practice to prevent false-positive exposures).
   */
  autoTrackExposure?: boolean;
}

export interface ExperimentHydrationResult<T extends Record<string, unknown> = Record<string, unknown>> {
  manager: FormManager<T> | MultiStepFormManager<T>;
  schema: FormSchema;
  experimentKey: string;
  variantId: string;
  context: ExperimentContext;
  trackExposure: () => void;
  hasTrackedExposure: () => boolean;
}

/**
 * Enterprise A/B Testing & Feature Flag Hydrator
 * Implements sticky session locks, decoupled exposure reporting, and cross-variant draft protection.
 */
export class ExperimentFormHydrator {
  /**
   * Selects a full schema variant using synchronous experiment evaluation.
   */
  static selectSchema(options: SelectSchemaOptions): {
    schema: FormSchema;
    variantId: string;
    experimentKey: string;
  } {
    const { experimentKey, variants, defaultVariant, experimentPort, context } = options;
    const fallbackKey = defaultVariant ?? Object.keys(variants)[0] ?? 'control';
    const variantId = experimentPort.getVariant(experimentKey, context, fallbackKey);

    const targetSchema = variants[variantId] ?? variants[fallbackKey];
    if (!targetSchema) {
      throw new Error(
        `[ExperimentFormHydrator] Variant '${variantId}' not found in provided schema variants for '${experimentKey}'`,
      );
    }

    // Clone and stamp experiment lineage to defend against cross-variant draft corruption
    const stampedSchema: FormSchema = {
      ...targetSchema,
      settings: {
        ...(targetSchema.settings ?? {}),
        experimentLineage: {
          experimentKey,
          variantId,
        },
      },
    };

    return {
      schema: stampedSchema,
      variantId,
      experimentKey,
    };
  }

  /**
   * Applies variant patch overrides on top of a base schema.
   */
  static patchSchema(options: PatchSchemaOptions): {
    schema: FormSchema;
    variantId: string;
    experimentKey: string;
  } {
    const { experimentKey, baseSchema, patches, defaultVariant, experimentPort, context } = options;
    const fallbackKey = defaultVariant ?? 'control';
    const variantId = experimentPort.getVariant(experimentKey, context, fallbackKey);

    let patchedSchema: FormSchema = { ...baseSchema };
    const patch = patches[variantId];

    if (typeof patch === 'function') {
      patchedSchema = patch(baseSchema);
    } else if (patch && typeof patch === 'object') {
      patchedSchema = {
        ...baseSchema,
        ...patch,
        pages: patch.pages ?? baseSchema.pages,
        settings: {
          ...(baseSchema.settings ?? {}),
          ...(patch.settings ?? {}),
        },
      };
    }

    // Stamp lineage
    patchedSchema = {
      ...patchedSchema,
      settings: {
        ...(patchedSchema.settings ?? {}),
        experimentLineage: {
          experimentKey,
          variantId,
        },
      },
    };

    return {
      schema: patchedSchema,
      variantId,
      experimentKey,
    };
  }

  /**
   * Hydrates a FormManager or MultiStepFormManager locked to the evaluated variant.
   */
  static hydrate<T extends Record<string, unknown> = Record<string, unknown>>(
    options: ExperimentHydrateOptions<T>,
  ): ExperimentHydrationResult<T> {
    const {
      experimentKey,
      variants,
      baseSchema,
      patches,
      defaultVariant,
      experimentPort,
      context,
      onSubmit,
      isMultiStep,
      multiStepOptions,
      autoTrackExposure = false,
    } = options;

    let resolvedSchema: FormSchema;
    let resolvedVariantId: string;

    if (variants) {
      const res = this.selectSchema({
        experimentKey,
        variants,
        defaultVariant,
        experimentPort,
        context,
      });
      resolvedSchema = res.schema;
      resolvedVariantId = res.variantId;
    } else if (baseSchema && patches) {
      const res = this.patchSchema({
        experimentKey,
        baseSchema,
        patches,
        defaultVariant,
        experimentPort,
        context,
      });
      resolvedSchema = res.schema;
      resolvedVariantId = res.variantId;
    } else if (baseSchema) {
      const fallbackKey = defaultVariant ?? 'control';
      resolvedVariantId = experimentPort.getVariant(experimentKey, context, fallbackKey);
      resolvedSchema = {
        ...baseSchema,
        settings: {
          ...(baseSchema.settings ?? {}),
          experimentLineage: {
            experimentKey,
            variantId: resolvedVariantId,
          },
        },
      };
    } else {
      throw new Error('[ExperimentFormHydrator] Either variants or baseSchema must be supplied');
    }

    let tracked = false;
    const trackExposure = () => {
      if (!tracked) {
        tracked = true;
        if (experimentPort.trackExposure) {
          experimentPort.trackExposure(experimentKey, resolvedVariantId, context);
        }
      }
    };

    if (autoTrackExposure) {
      trackExposure();
    }

    let manager: FormManager<T> | MultiStepFormManager<T>;

    if (isMultiStep) {
      const mergedMultiStepOptions: MultiStepFormOptions<T> = {
        ...multiStepOptions,
        telemetry: options.telemetry ?? multiStepOptions?.telemetry,
      };
      manager = new MultiStepFormManager<T>(resolvedSchema, onSubmit, mergedMultiStepOptions);
    } else {
      manager = FormHydrator.hydrate<T>(
        {
          fields: (resolvedSchema.pages[0]?.fields ?? []) as any,
        },
        onSubmit,
        {
          ...options.hydrationOptions,
          telemetry: options.telemetry,
          formId: resolvedSchema.id,
          schemaVersion: resolvedSchema.version,
          experimentLineage: {
            experimentKey,
            variantId: resolvedVariantId,
          },
        },
      );
    }

    return {
      manager,
      schema: resolvedSchema,
      experimentKey,
      variantId: resolvedVariantId,
      context,
      trackExposure,
      hasTrackedExposure: () => tracked,
    };
  }

  /**
   * Validates draft compatibility against an active variant.
   * Defends against Trap 4: Cross-Variant Draft Poisoning.
   */
  static validateDraftCompatibility(
    draft: FormDraftSnapshot,
    activeVariantId: string,
    activeExperimentKey?: string,
  ): {
    isCompatible: boolean;
    reason?: 'VARIANT_MISMATCH' | 'EXPERIMENT_MISMATCH' | 'SCHEMA_VERSION_MISMATCH';
    draftVariantId?: string;
  } {
    if (!draft.experimentLineage) {
      return { isCompatible: true };
    }

    const { experimentKey, variantId } = draft.experimentLineage;

    if (activeExperimentKey && experimentKey !== activeExperimentKey) {
      return {
        isCompatible: false,
        reason: 'EXPERIMENT_MISMATCH',
        draftVariantId: variantId,
      };
    }

    if (variantId !== activeVariantId) {
      return {
        isCompatible: false,
        reason: 'VARIANT_MISMATCH',
        draftVariantId: variantId,
      };
    }

    return { isCompatible: true, draftVariantId: variantId };
  }
}
