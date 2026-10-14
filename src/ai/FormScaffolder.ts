import type { FormSchema, FormPage, FormField, FieldType, SemanticIntent } from '../schema/FormSchema.js';
import { safeValidateFormSchema } from '../schema/FormSchemaValidation.js';
import { lintFormSchema, type SchemaLintIssue } from '../schema/SchemaLint.js';
import { compilePromptToSchema, type LlmCompletionCaller } from './SchemaCompiler.js';
import type { SystemPromptOptions } from './prompts.js';
import { MultiStepFormManager } from '../manager/MultiStepFormManager.js';
import { FormManager } from '../manager/FormManager.js';
import { AnalyticsEngine, type VisualizationReport } from '../analytics/AnalyticsEngine.js';
import type { FormResponse } from '../schema/FormSchema.js';
import type { IStoragePort } from '../ports/IStoragePort.js';
import type { ITelemetryPort } from '../ports/ITelemetryPort.js';

export interface SimpleFieldRequirement {
  name: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  options?: Array<{ label: string; value: string; description?: string }>;
  semanticIntent?: SemanticIntent;
  privacyRationale?: string;
  helperText?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  config?: Record<string, unknown>;
}

export interface SimpleFormRequirements {
  id?: string;
  title: string;
  description?: string;
  fields: SimpleFieldRequirement[];
  maxFieldsPerPage?: number;
  includeVisualization?: boolean;
  visualizationTitle?: string;
}

export interface FormScaffoldResult {
  success: boolean;
  schema?: FormSchema;
  errors?: string[];
  warnings?: string[];
  lintIssues?: SchemaLintIssue[];
  rawLlmResponse?: string;
}

export interface RuntimeManagerOptions {
  onSubmit?: (values: Record<string, unknown>) => Promise<void> | void;
  storage?: IStoragePort;
  telemetry?: ITelemetryPort;
}

/**
 * Enterprise Form Scaffolding Engine.
 * Converts human prompt requirements into elegant, atomic, WCAG-compliant FormSchemas,
 * initializes runtime execution state machines, and provides instant analytics hooks.
 */
export class FormScaffolder {
  /**
   * Automatically infers semantic intents based on field naming patterns.
   */
  public static inferSemanticIntent(fieldName: string, type: FieldType): SemanticIntent | undefined {
    const lower = fieldName.toLowerCase().replace(/[-_]/g, '');

    if (type === 'email' || lower.includes('email')) return 'contact-email';
    if (lower.includes('phone') || lower.includes('mobile') || lower.includes('tel') || (lower.includes('contact') && lower.includes('number'))) return 'contact-phone';
    if (lower.includes('firstname') || lower.includes('givenname')) return 'name-given';
    if (lower.includes('middlename') || lower === 'mname') return 'name-middle';
    if (lower.includes('lastname') || lower.includes('familyname') || lower.includes('surname')) return 'name-family';
    if (lower.includes('prefix') || lower.includes('salutation') || lower.includes('title')) return 'name-prefix';
    if (lower.includes('suffix')) return 'name-suffix';
    if (lower.includes('fullname') || lower === 'name') return 'name-full';
    if (lower.includes('company') || lower.includes('organization') || lower.includes('employer')) return 'organization-name';
    if (lower.includes('taxid') || lower.includes('ssn') || lower.includes('tin') || lower.includes('nic')) return 'identity-tax-id';
    if (lower.includes('birth') || lower.includes('dob')) return 'birth-date';
    if (lower.includes('addressline2') || lower === 'apt' || lower === 'suite') return 'address-line2';
    if (lower.includes('street') || lower.includes('addressline1') || lower.includes('address')) return 'address-line1';
    if (lower.includes('city') || lower.includes('town')) return 'address-city';
    if (lower.includes('state') || lower.includes('province') || lower.includes('district')) return 'address-state';
    if (lower.includes('zip') || lower.includes('postal')) return 'address-postal-code';
    if (lower.includes('country')) return 'address-country';
    if (type === 'password' || lower.includes('password')) return 'current-password';

    return undefined;
  }

  /**
   * Deterministic, zero-LLM scaffolding from structured field requirements.
   * Chunks fields progressively into pages according to cognitive load heuristics.
   */
  public static scaffoldFromRequirements(req: SimpleFormRequirements): FormSchema {
    const maxPerPage = Math.max(1, req.maxFieldsPerPage ?? 6);
    const pages: FormPage[] = [];
    const fields = req.fields;

    const pageCount = Math.ceil(Math.max(1, fields.length) / maxPerPage);

    for (let p = 0; p < pageCount; p++) {
      const pageId = `step-${p + 1}`;
      const pageFieldsSlice = fields.slice(p * maxPerPage, (p + 1) * maxPerPage);

      const pageFields: FormField[] = pageFieldsSlice.map((f, idx) => {
        const fieldType: FieldType = f.type ?? 'text';
        const semanticIntent = f.semanticIntent ?? this.inferSemanticIntent(f.name, fieldType);

        let privacyRationale = f.privacyRationale;
        if (!privacyRationale && (semanticIntent === 'identity-tax-id' || semanticIntent === 'contact-phone')) {
          privacyRationale = `Required for identity verification and account communications.`;
        }

        return {
          id: `f-${p + 1}-${idx + 1}`,
          name: f.name,
          type: fieldType,
          label: f.label ?? f.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          required: f.required ?? true,
          placeholder: f.placeholder,
          helperText: f.helperText,
          options: f.options,
          semanticIntent,
          privacyRationale,
          min: f.min,
          max: f.max,
          order: idx + 1,
          config: f.config,
        };
      });

      const isLastPage = p === pageCount - 1;
      const nextPageId = !isLastPage ? `step-${p + 2}` : undefined;

      pages.push({
        id: pageId,
        title: pageCount > 1 ? `${req.title} - Step ${p + 1}` : req.title,
        description: p === 0 ? req.description : undefined,
        fields: pageFields,
        defaultNextPageId: nextPageId,
      });
    }

    // Optional dynamic visualization embed on terminal page or dedicated summary
    if (req.includeVisualization) {
      const numericFields = fields.filter((f) => f.type === 'number' || f.type === 'slider');
      if (numericFields.length > 0) {
        const lastPage = pages[pages.length - 1];
        lastPage.fields.push({
          id: `f-vis-1`,
          name: 'live_assessment_metrics',
          type: 'visualization',
          label: req.visualizationTitle ?? 'Real-time Assessment Visualization',
          required: false,
          order: lastPage.fields.length + 1,
          visualization: {
            visualizationType: 'gauge',
            title: req.visualizationTitle ?? 'Assessment Score',
            metrics: numericFields.map((nf) => ({
              label: nf.label ?? nf.name,
              value: nf.min ?? 50,
              target: nf.max ?? 100,
              unit: typeof nf.config?.unit === 'string' ? nf.config.unit : undefined,
            })),
            dataFallback: [{ label: 'Baseline', value: 0 }],
          },
        });
      }
    }

    const schema: FormSchema = {
      v: '1.0',
      id: req.id || `form-${Date.now()}`,
      tenantId: 'default',
      title: req.title,
      description: req.description,
      pages,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return schema;
  }

  /**
   * Scaffolds an enterprise form from a natural language prompt using an LLM caller,
   * validates against Zod/StandardSchema, enforces privacy heuristics, and lints cycles.
   */
  public static async scaffoldFromPrompt(
    prompt: string,
    caller: LlmCompletionCaller,
    options?: SystemPromptOptions
  ): Promise<FormScaffoldResult> {
    const compileResult = await compilePromptToSchema(prompt, caller, options);

    if (!compileResult.success || !compileResult.schema) {
      return {
        success: false,
        rawLlmResponse: compileResult.rawResponse,
        errors: compileResult.validationErrors ?? [compileResult.parseError ?? 'Unknown compilation error'],
        lintIssues: compileResult.lintIssues,
      };
    }

    // Post-compile heuristic enrichment: ensure semanticIntents and privacyRationales
    const schema = compileResult.schema;
    for (const page of schema.pages) {
      for (const field of page.fields) {
        if (!field.semanticIntent) {
          field.semanticIntent = this.inferSemanticIntent(field.name, field.type);
        }
        if (!field.privacyRationale && (field.semanticIntent === 'identity-tax-id' || field.semanticIntent === 'contact-phone')) {
          field.privacyRationale = 'Collected securely for identity verification and regulatory compliance.';
        }
      }
    }

    // Re-verify contract & lint
    const validation = safeValidateFormSchema(schema);
    const lint = lintFormSchema(schema);

    return {
      success: validation.success && lint.valid,
      schema,
      rawLlmResponse: compileResult.rawResponse,
      errors: validation.error?.issues.map((i) => i.message),
      warnings: lint.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      lintIssues: lint.issues,
    };
  }

  /**
   * Spawns a fully configured runtime MultiStepFormManager for the scaffolded schema.
   */
  public static createMultiStepManager<T extends Record<string, unknown> = Record<string, unknown>>(
    schema: FormSchema,
    options?: RuntimeManagerOptions
  ): MultiStepFormManager<T> {
    return new MultiStepFormManager<T>(
      schema,
      options?.onSubmit ?? (async () => {})
    );
  }

  /**
   * Spawns a single-step FormManager for a specific page or flattened schema fields.
   */
  public static createFormManager<T extends Record<string, unknown> = Record<string, unknown>>(
    page: FormPage,
    options?: RuntimeManagerOptions
  ): FormManager<T> {
    const fieldsMap: Record<string, FormField> = {};
    for (const f of page.fields) {
      fieldsMap[f.name] = f;
    }

    return new FormManager<T>({
      fields: fieldsMap as any,
      onSubmit: (options?.onSubmit ?? (async () => {})) as (values: T) => void | Promise<void>,
    });
  }

  /**
   * Generates a visualization and analytics report from responses collected for this schema.
   */
  public static analyzeResponses(schema: FormSchema, responses: FormResponse[]): VisualizationReport {
    const allFields = schema.pages.flatMap((p) => p.fields);
    return AnalyticsEngine.generateVisualizationReport(allFields, responses, `${schema.title} Analytics & Visualizations`);
  }
}
