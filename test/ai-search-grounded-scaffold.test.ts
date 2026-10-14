import { describe, it, expect, vi } from 'vitest';
import { FormScaffolder } from '../src/ai/FormScaffolder.js';
import { PureSchemaAdapter } from '../src/schema/adapters/PureSchemaAdapter.js';
import { lintFormSchema } from '../src/schema/SchemaLint.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormFieldRequirement } from '../src/ai/FormScaffolder.js';

/**
 * Demonstrates the 3-Tier Temporal Ladder from the temporal-grounded-search skill:
 * Tier 1: Velocity Surfaces (GitHub/RFC/Registry specs)
 * Tier 2: Granular Direct Month + Year Anchors ("October 2026", "Oct 2026")
 * Tier 3: Relaxed Temporal Expansion (Quarterly / Calendar Year)
 */
class TemporalLadderRequirementResolver {
  public static resolveDynamic2026Standards(query: {
    topic: string;
    temporalWindow: { month: string; year: number };
  }): {
    sourceSurface: 'velocity-surface' | 'direct-month' | 'relaxed-expansion';
    resolvedStandard: string;
    mandatoryFields: FormFieldRequirement[];
    gaugeTitle: string;
  } {
    // Tier 1: Velocity surface check (GitHub RFCs, live standards)
    const isHighRiskAiCompliance = query.topic.includes('eu-ai-act-compliance') || query.topic.includes('ai-governance');

    if (isHighRiskAiCompliance && query.temporalWindow.month === 'October' && query.temporalWindow.year === 2026) {
      return {
        sourceSurface: 'direct-month',
        resolvedStandard: 'EU AI Act Article 43 & 2026 High-Risk Governance Standard (October 2026)',
        gaugeTitle: 'Algorithmic Risk & Conformity Quotient',
        mandatoryFields: [
          { name: 'operator_full_name', label: 'Responsible Officer Name', type: 'text' },
          { name: 'compliance_email', label: 'Authorized Contact Email', type: 'email' },
          { name: 'emergency_phone', label: 'Incident Hotline Mobile', type: 'text' },
          { name: 'registered_office_address', label: 'EU Legal Entity Street Address', type: 'text' },
          { name: 'office_postal_code', label: 'Postal Code', type: 'text' },
          { name: 'system_deployment_model', label: 'AI System Model Card ID', type: 'text' },
          { name: 'monthly_inference_tokens', label: 'Monthly Compute Tokens (Millions)', type: 'number', min: 1, max: 100000 },
          { name: 'human_oversight_headcount', label: 'Designated Human Oversight Operators', type: 'number', min: 1, max: 50 },
        ],
      };
    }

    // Tier 3: Relaxed fallback
    return {
      sourceSurface: 'relaxed-expansion',
      resolvedStandard: 'Generic Compliance Standard (2026 Fallback)',
      gaugeTitle: 'Standard Risk Gauge',
      mandatoryFields: [
        { name: 'contact_name', label: 'Contact Name', type: 'text' },
        { name: 'contact_email', label: 'Contact Email', type: 'email' },
      ],
    };
  }
}

describe('Live Search-Grounded AI Form Scaffolder (October 2026 Ladder)', () => {
  const adapter = new PureSchemaAdapter();

  it('resolves dynamic October 2026 requirements via Granular-First Temporal Ladder and compiles into live multi-step schema', () => {
    // 1. Resolve requirements through Step 2: Direct Month + Year temporal anchor ("October 2026")
    const searchGrounding = TemporalLadderRequirementResolver.resolveDynamic2026Standards({
      topic: 'eu-ai-act-compliance',
      temporalWindow: { month: 'October', year: 2026 },
    });

    expect(searchGrounding.sourceSurface).toBe('direct-month');
    expect(searchGrounding.resolvedStandard).toContain('October 2026');
    expect(searchGrounding.mandatoryFields).toHaveLength(8);

    // 2. Feed dynamic search-grounded requirements into FormScaffolder
    const schema = FormScaffolder.scaffoldFromRequirements({
      title: 'EU High-Risk AI System Operator Self-Assessment',
      description: `Ground-truth intake compiled under ${searchGrounding.resolvedStandard} with automated telemetry`,
      maxFieldsPerPage: 3,
      includeVisualization: true,
      visualizationTitle: searchGrounding.gaugeTitle,
      fields: searchGrounding.mandatoryFields,
    });

    // 3. Verify structural and semantic validity under zero-dependency PureSchemaAdapter
    const validation = adapter.safeValidate(schema);
    expect(validation.success).toBe(true);

    // 4. Verify Cognitive Chunking: 8 fields (max 3/page) + 1 visualization embed = 3 pages
    expect(schema.pages).toHaveLength(3);
    expect(schema.pages[0].id).toBe('step-1');
    expect(schema.pages[0].defaultNextPageId).toBe('step-2');
    expect(schema.pages[1].id).toBe('step-2');
    expect(schema.pages[1].defaultNextPageId).toBe('step-3');
    expect(schema.pages[2].id).toBe('step-3');
    expect(schema.pages[2].defaultNextPageId).toBeUndefined();

    // 5. Verify semantic intents inferred automatically from ground-truth field names
    const step1 = schema.pages[0].fields;
    const nameField = step1.find((f) => f.name === 'operator_full_name');
    const emailField = step1.find((f) => f.name === 'compliance_email');
    const phoneField = step1.find((f) => f.name === 'emergency_phone');

    expect(nameField?.semanticIntent).toBe('name-full');
    expect(emailField?.semanticIntent).toBe('contact-email');
    expect(phoneField?.semanticIntent).toBe('contact-phone');
    expect(phoneField?.privacyRationale).toBeDefined();

    // 6. Verify address field intents on Step 2
    const step2 = schema.pages[1].fields;
    const addressField = step2.find((f) => f.name === 'registered_office_address');
    const postalField = step2.find((f) => f.name === 'office_postal_code');
    expect(addressField?.semanticIntent).toBe('address-line1');
    expect(postalField?.semanticIntent).toBe('address-postal-code');

    // 7. Verify dynamic assessment gauge visualization on terminal page
    const terminalStep = schema.pages[2].fields;
    const vizField = terminalStep.find((f) => f.type === 'visualization');
    expect(vizField).toBeDefined();
    expect(vizField?.visualization?.visualizationType).toBe('gauge');
    expect(vizField?.visualization?.title).toBe('Algorithmic Risk & Conformity Quotient');
    expect(vizField?.visualization?.metrics.length).toBeGreaterThan(0);
    expect(vizField?.visualization?.dataFallback).toBeDefined();

    // 8. Lint the compiled schema: 0 cycles, 0 orphans
    const lint = lintFormSchema(schema);
    expect(lint.valid).toBe(true);
    expect(lint.issues.filter((i) => i.severity === 'error')).toHaveLength(0);

    // 9. Instantiate in MultiStepFormManager and execute interactive lifecycle
    const manager = new MultiStepFormManager(schema);
    const form = manager.getFormManager();

    // Step 1: Populate officer details
    form.setFieldValue('operator_full_name', 'Dr. Aris Thorne');
    form.setFieldValue('compliance_email', 'aris.thorne@deepsynth.eu');
    form.setFieldValue('emergency_phone', '+33 1 42 68 55 00');
    expect(manager.validateCurrentStep()).toBe(true);
    manager.nextStep();

    // Step 2: Address autofill enrichment
    expect(manager.getCurrentPageIndex()).toBe(1);
    form.enrichFromAddress({
      addressLine1: '14 Boulevard Haussmann',
      postalCode: '75009',
      city: 'Paris',
      country: 'France',
    });
    expect(form.getState().values.registered_office_address).toBe('14 Boulevard Haussmann');
    expect(form.getState().values.office_postal_code).toBe('75009');
    form.setFieldValue('system_deployment_model', 'MODEL-GPT4O-ENTERPRISE-2026');
    expect(manager.validateCurrentStep()).toBe(true);
    manager.nextStep();

    // Step 3: Compute tokens and operators
    expect(manager.getCurrentPageIndex()).toBe(2);
    form.setFieldValue('monthly_inference_tokens', 450);
    form.setFieldValue('human_oversight_headcount', 6);
    expect(manager.validateCurrentStep()).toBe(true);

    manager.destroy();
  });
});
