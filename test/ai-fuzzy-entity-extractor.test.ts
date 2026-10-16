import { describe, it, expect } from 'vitest';
import { CallbackLLMExtractorAdapter } from '../src/adapters/ai/CallbackLLMExtractorAdapter.js';
import type { FormField } from '../src/schema/FormSchema.js';

describe('CallbackLLMExtractorAdapter: Fuzzy Semantic Intent & Safe Coercion Hardening', () => {
  const targetFields: FormField[] = [
    {
      id: 'f1',
      name: 'contact_phone',
      label: 'Primary Phone Number',
      type: 'tel',
      semanticIntent: 'phone',
      required: true,
      order: 1,
    },
    {
      id: 'f2',
      name: 'annual_revenue',
      label: 'Annual Gross Income',
      type: 'number',
      semanticIntent: 'income',
      required: true,
      order: 2,
    },
    {
      id: 'f3',
      name: 'is_us_citizen',
      label: 'US Citizen',
      type: 'checkbox',
      required: true,
      order: 3,
    },
    {
      id: 'f4',
      name: 'applicant_tax_id',
      label: 'Social Security Number / ITIN',
      type: 'text',
      semanticIntent: 'identity-tax-id',
      required: true,
      order: 4,
    },
  ];

  it('resolves semantic aliases to target field names', async () => {
    const mockLLMCaller = async () => JSON.stringify({
      mobile: { value: '+1 (555) 234-5678', confidence: 0.95 },
      salary: { value: 125000, confidence: 0.9 },
      ssn: { value: '123-45-6789', confidence: 0.99 },
    });

    const adapter = new CallbackLLMExtractorAdapter(mockLLMCaller);
    const results = await adapter.extractEntities({
      text: 'My cell is 555-234-5678, I earn 125k salary, ssn 123-45-6789',
      targetFields,
    });

    expect(results).toHaveLength(3);

    const phoneEntity = results.find((r) => r.field === 'contact_phone');
    expect(phoneEntity).toBeDefined();
    expect(phoneEntity?.value).toBe('+1 (555) 234-5678');

    const incomeEntity = results.find((r) => r.field === 'annual_revenue');
    expect(incomeEntity).toBeDefined();
    expect(incomeEntity?.value).toBe(125000);

    const taxEntity = results.find((r) => r.field === 'applicant_tax_id');
    expect(taxEntity).toBeDefined();
    expect(taxEntity?.value).toBe('123-45-6789');
  });

  it('safely coerces currency strings and percentages to numbers', async () => {
    const mockLLMCaller = async () => JSON.stringify({
      annual_revenue: { value: '$150,000.00', confidence: 0.92 },
    });

    const adapter = new CallbackLLMExtractorAdapter(mockLLMCaller);
    const results = await adapter.extractEntities({
      text: 'Gross revenue is $150,000.00 annually',
      targetFields,
    });

    const incomeEntity = results.find((r) => r.field === 'annual_revenue');
    expect(incomeEntity).toBeDefined();
    expect(incomeEntity?.value).toBe(150000);
    expect(typeof incomeEntity?.value).toBe('number');
  });

  it('safely coerces natural language boolean representations to boolean primitives', async () => {
    const mockLLMCaller = async () => JSON.stringify({
      is_us_citizen: { value: 'yes', confidence: 0.98 },
    });

    const adapter = new CallbackLLMExtractorAdapter(mockLLMCaller);
    const results = await adapter.extractEntities({
      text: 'Yes, I am a US citizen.',
      targetFields,
    });

    const citizenEntity = results.find((r) => r.field === 'is_us_citizen');
    expect(citizenEntity).toBeDefined();
    expect(citizenEntity?.value).toBe(true);
    expect(typeof citizenEntity?.value).toBe('boolean');
  });

  it('strips markdown code blocks and protects against prototype pollution keys', async () => {
    const rawMarkdownWithPollution = `
\`\`\`json
{
  "__proto__": { "polluted": true },
  "constructor": "malicious",
  "prototype": "malicious",
  "contact_phone": { "value": "555-0199", "confidence": 0.88 }
}
\`\`\`
    `;

    const adapter = new CallbackLLMExtractorAdapter(async () => rawMarkdownWithPollution);
    const results = await adapter.extractEntities({
      text: 'My phone is 555-0199',
      targetFields,
    });

    expect(results).toHaveLength(1);
    expect(results[0].field).toBe('contact_phone');
    expect(results[0].value).toBe('555-0199');
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it('integrates end-to-end with MultiStepFormManager.enrichFromFreeformText and supports rollback', async () => {
    const { MultiStepFormManager } = await import('../src/manager/MultiStepFormManager.js');

    const formSchema = {
      v: '1.0',
      id: 'loan-intake-form',
      tenantId: 'financial-services',
      title: 'Commercial Loan Application',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        {
          id: 'step-applicant',
          title: 'Applicant Financial Profile',
          fields: targetFields,
        },
      ],
    };

    const mockLLMCaller = async () => JSON.stringify({
      mobile: { value: '555-888-9999', confidence: 0.95 },
      salary: { value: '$180,000.00', confidence: 0.94 },
      ssn: { value: '987-65-4321', confidence: 0.96 },
      is_us_citizen: { value: 'yes', confidence: 0.99 },
    });

    const adapter = new CallbackLLMExtractorAdapter(mockLLMCaller);
    const manager = new MultiStepFormManager(formSchema, () => {});

    // Pre-populate one field to test preserve-user-edits policy
    manager.setFieldValue('contact_phone' as any, 'PRESERVED-USER-PHONE');

    const enrichmentResult = await manager.enrichFromFreeformText(
      'Messy paste containing phone, income, and ssn data',
      {
        extractor: adapter,
        overwritePolicy: 'preserve-user-edits',
      }
    );

    const values = manager.getState().values as any;

    // contact_phone was already edited by user -> preserved!
    expect(values.contact_phone).toBe('PRESERVED-USER-PHONE');
    expect(enrichmentResult.skippedFields.map((s) => s.field)).toContain('contact_phone');

    // Unfilled fields are enriched with fuzzy resolution & coerced types
    expect(values.annual_revenue).toBe(180000);
    expect(typeof values.annual_revenue).toBe('number');
    expect(values.applicant_tax_id).toBe('987-65-4321');
    expect(values.is_us_citizen).toBe(true);

    // Rollback test: calling rollback resets enriched fields back to original state
    enrichmentResult.rollback();
    const rolledBackValues = manager.getState().values as any;

    expect(rolledBackValues.contact_phone).toBe('PRESERVED-USER-PHONE'); // Never touched
    expect(rolledBackValues.annual_revenue).toBeNull(); // Reset to initial null
    expect(rolledBackValues.applicant_tax_id).toBe(''); // Reset to initial empty string
    expect(rolledBackValues.is_us_citizen).toBe(false); // Reset to initial false
  }, 15000);
});

