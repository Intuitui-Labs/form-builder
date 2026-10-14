import { describe, it, expect, vi } from 'vitest';
import { FormScaffolder } from '../src/ai/FormScaffolder.js';
import { safeValidateFormSchema } from '../src/schema/FormSchemaValidation.js';
import { lintFormSchema } from '../src/schema/SchemaLint.js';
import type { FormResponse } from '../src/schema/FormSchema.js';

describe('FormScaffolder & AI Autonomous Form Lifecycle', () => {
  it('correctly infers semantic intents and privacy rationales across personal and financial fields', () => {
    expect(FormScaffolder.inferSemanticIntent('user_email', 'email')).toBe('contact-email');
    expect(FormScaffolder.inferSemanticIntent('contact_number', 'text')).toBe('contact-phone');
    expect(FormScaffolder.inferSemanticIntent('applicant_first_name', 'text')).toBe('name-given');
    expect(FormScaffolder.inferSemanticIntent('surname', 'text')).toBe('name-family');
    expect(FormScaffolder.inferSemanticIntent('tax_id_ssn', 'text')).toBe('identity-tax-id');
    expect(FormScaffolder.inferSemanticIntent('middle_name', 'text')).toBe('name-middle');
    expect(FormScaffolder.inferSemanticIntent('title_salutation', 'text')).toBe('name-prefix');
    expect(FormScaffolder.inferSemanticIntent('name_suffix', 'text')).toBe('name-suffix');
    expect(FormScaffolder.inferSemanticIntent('employer_company', 'text')).toBe('organization-name');
    expect(FormScaffolder.inferSemanticIntent('delivery_street_address', 'text')).toBe('address-line1');
    expect(FormScaffolder.inferSemanticIntent('postal_zip', 'text')).toBe('address-postal-code');
    expect(FormScaffolder.inferSemanticIntent('random_hobby', 'text')).toBeUndefined();
  });

  it('scaffolds an enterprise multi-page form from simple requirements with zero runtime hallucinations', () => {
    const schema = FormScaffolder.scaffoldFromRequirements({
      title: 'Mortgage Pre-Approval Intake',
      description: 'Streamlined mortgage assessment pipeline',
      maxFieldsPerPage: 3,
      includeVisualization: true,
      visualizationTitle: 'Debt-to-Income Health Quotient',
      fields: [
        { name: 'full_name', label: 'Full Legal Name' },
        { name: 'applicant_email', label: 'Email Address', type: 'email' },
        { name: 'phone_number', label: 'Mobile Phone', type: 'text' },
        { name: 'monthly_gross_income', label: 'Monthly Gross Income', type: 'number', min: 1000, max: 50000, config: { unit: 'USD' } },
        { name: 'monthly_debts', label: 'Monthly Existing Debts', type: 'number', min: 0, max: 20000, config: { unit: 'USD' } },
        {
          name: 'employment_status',
          label: 'Employment Status',
          type: 'select',
          options: [
            { label: 'Employed Full-time', value: 'full_time' },
            { label: 'Self Employed', value: 'self_employed' },
            { label: 'Retired', value: 'retired' },
          ],
        },
        { name: 'tax_identification', label: 'Social Security / Tax ID', type: 'text' },
      ],
    });

    // 1. Structural validity
    const validation = safeValidateFormSchema(schema);
    expect(validation.success).toBe(true);

    // 2. Cognitive chunking: 7 fields with max 3 per page + 1 visualization field = 3 pages
    expect(schema.pages).toHaveLength(3);
    expect(schema.pages[0].id).toBe('step-1');
    expect(schema.pages[0].defaultNextPageId).toBe('step-2');
    expect(schema.pages[1].id).toBe('step-2');
    expect(schema.pages[1].defaultNextPageId).toBe('step-3');
    expect(schema.pages[2].id).toBe('step-3');
    expect(schema.pages[2].defaultNextPageId).toBeUndefined();

    // 3. Privacy rationales automatically attached
    const phoneField = schema.pages[0].fields.find((f) => f.name === 'phone_number');
    expect(phoneField?.semanticIntent).toBe('contact-phone');
    expect(phoneField?.privacyRationale).toBeDefined();

    const taxField = schema.pages[2].fields.find((f) => f.name === 'tax_identification');
    expect(taxField?.semanticIntent).toBe('identity-tax-id');
    expect(taxField?.privacyRationale).toBeDefined();

    // 4. Interactive visualization descriptor embedded on final page
    const visField = schema.pages[2].fields.find((f) => f.type === 'visualization');
    expect(visField).toBeDefined();
    expect(visField?.visualization?.visualizationType).toBe('gauge');
    expect(visField?.visualization?.metrics.length).toBeGreaterThan(0);

    // 5. Soundness linting (0 circular cycles, 0 orphans)
    const lint = lintFormSchema(schema);
    expect(lint.valid).toBe(true);
  });

  it('scaffolds from natural language prompt and compiles with LLM caller', async () => {
    const mockLlm = vi.fn().mockResolvedValue(`
      \`\`\`json
      {
        "id": "onboarding-v1",
        "title": "Developer Onboarding",
        "pages": [
          {
            "id": "page-1",
            "title": "Identity",
            "fields": [
              {
                "id": "f1",
                "name": "full_name",
                "type": "text",
                "label": "Full Name",
                "required": true
              },
              {
                "id": "f2",
                "name": "contact_phone",
                "type": "text",
                "label": "Phone Number",
                "required": true
              }
            ]
          }
        ]
      }
      \`\`\`
    `);

    const result = await FormScaffolder.scaffoldFromPrompt(
      'Create a simple developer onboarding form asking for name and phone',
      mockLlm
    );

    expect(result.success).toBe(true);
    expect(result.schema).toBeDefined();
    expect(result.schema?.title).toBe('Developer Onboarding');

    // Field was enriched with semantic intent and privacy rationale
    const phone = result.schema?.pages[0].fields.find((f) => f.name === 'contact_phone');
    expect(phone?.semanticIntent).toBe('contact-phone');
    expect(phone?.privacyRationale).toContain('identity verification');
  });

  it('powers full end-to-end execution: runtime navigation and interactive visualization analytics', async () => {
    const schema = FormScaffolder.scaffoldFromRequirements({
      title: 'Customer Satisfaction & Net Promoter Assessment',
      fields: [
        { name: 'respondent_name', label: 'Name' },
        { name: 'satisfaction_rating', label: 'Satisfaction Score', type: 'slider', min: 1, max: 10, config: { unit: 'pts', target: 8 } },
        {
          name: 'recommendation_tier',
          label: 'Would you recommend us?',
          type: 'select',
          options: [
            { label: 'Definitely', value: 'yes' },
            { label: 'Maybe', value: 'maybe' },
            { label: 'No', value: 'no' },
          ],
        },
      ],
      maxFieldsPerPage: 2,
    });

    let submittedData: Record<string, unknown> | null = null;
    const manager = FormScaffolder.createMultiStepManager(schema, {
      onSubmit: async (values) => {
        submittedData = values;
      },
    });

    // Step 1: fill fields
    expect(manager.getCurrentPageIndex()).toBe(0);
    manager.getFormManager().setFieldValue('respondent_name', 'Margaret Hamilton');
    manager.getFormManager().setFieldValue('satisfaction_rating', 10);

    // Advance to Step 2
    const step1Valid = await manager.validateCurrentStep();
    expect(step1Valid).toBe(true);
    manager.nextStep();
    expect(manager.getCurrentPageIndex()).toBe(1);

    // Step 2: fill tier & submit
    manager.getFormManager().setFieldValue('recommendation_tier', 'yes');
    await manager.submit();

    expect(submittedData).toEqual({
      respondent_name: 'Margaret Hamilton',
      satisfaction_rating: 10,
      recommendation_tier: 'yes',
    });

    // Generate Response Analytics & Visualization Report
    const mockResponses: FormResponse[] = [
      {
        id: 'r1',
        formId: schema.id,
        tenantId: 'default',
        submittedAt: new Date().toISOString(),
        data: {
          respondent_name: 'Margaret Hamilton',
          satisfaction_rating: 10,
          recommendation_tier: 'yes',
        },
      },
      {
        id: 'r2',
        formId: schema.id,
        tenantId: 'default',
        submittedAt: new Date().toISOString(),
        data: {
          respondent_name: 'Grace Hopper',
          satisfaction_rating: 8,
          recommendation_tier: 'yes',
        },
      },
      {
        id: 'r3',
        formId: schema.id,
        tenantId: 'default',
        submittedAt: new Date().toISOString(),
        data: {
          respondent_name: 'Alan Turing',
          satisfaction_rating: 6,
          recommendation_tier: 'maybe',
        },
      },
    ];

    const report = FormScaffolder.analyzeResponses(schema, mockResponses);
    expect(report.totalSubmissions).toBe(3);

    // Numeric gauge for satisfaction_rating
    expect(report.gauges).toHaveLength(1);
    expect(report.gauges[0].label).toBe('Satisfaction Score');
    expect(report.gauges[0].value).toBe(8); // (10 + 8 + 6) / 3 = 8
    expect(report.gauges[0].target).toBe(8);
    expect(report.gauges[0].status).toBe('optimal');

    // Distribution chart for recommendation_tier
    expect(report.distributions).toHaveLength(1);
    expect(report.distributions[0].label).toBe('Would you recommend us?');
    expect(report.distributions[0].data['Definitely']).toBe(2);
    expect(report.distributions[0].data['Maybe']).toBe(1);

    // Summary Insights generated
    expect(report.summaryInsights.length).toBeGreaterThan(0);
    expect(report.summaryInsights.some((s) => s.includes('Average Satisfaction Score: 8'))).toBe(true);
  });
});
