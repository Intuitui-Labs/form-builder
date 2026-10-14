import { describe, it, expect } from 'vitest';
import { compilePromptToSchema, normalizeAndHealSchema } from '../src/ai/SchemaCompiler.js';

describe('AI Schema Compiler - Hallucination Healing & Injection Sanitization', () => {
  it('heals common LLM hallucinated field types into valid engine primitives', () => {
    const rawWithHallucinations = {
      id: 'loan-application',
      title: 'Loan Intake Form',
      pages: [
        {
          id: 'step-applicant',
          title: 'Applicant Details',
          fields: [
            {
              id: 'f-employed',
              name: 'is_employed',
              type: 'boolean', // Hallucinated type
              label: 'Are you employed?',
            },
            {
              id: 'f-term',
              name: 'loan_term',
              type: 'dropdown', // Hallucinated type
              label: 'Loan Term',
              options: [
                { label: '15 Years', value: '15' },
                { label: '30 Years', value: '30' },
              ],
            },
            {
              id: 'f-score',
              name: 'credit_score',
              type: 'integer', // Hallucinated type
              label: 'Estimated Credit Score',
            },
          ],
        },
      ],
    };

    const healed = normalizeAndHealSchema(rawWithHallucinations);

    expect(healed.pages[0].fields[0].type).toBe('select');
    expect(healed.pages[0].fields[0].options).toEqual([
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ]);

    expect(healed.pages[0].fields[1].type).toBe('select');
    expect(healed.pages[0].fields[2].type).toBe('number');
  });

  it('strips malicious <script> tags from title, description, and labels', () => {
    const maliciousPayload = {
      title: 'Contact Us <script>alert("pwned")</script>',
      description: 'Please submit <script src="evil.js"></script>',
      pages: [
        {
          title: 'Details',
          fields: [
            {
              id: 'f-name',
              name: 'full_name',
              type: 'text',
              label: 'Full Name <script>fetch("steal-cookie")</script>',
            },
          ],
        },
      ],
    };

    const healed = normalizeAndHealSchema(maliciousPayload);

    expect(healed.title).toBe('Contact Us');
    expect(healed.description).toBe('Please submit');
    expect(healed.pages[0].fields[0].label).toBe('Full Name');
  });

  it('compiles full prompt with hallucinated types successfully through compilePromptToSchema', async () => {
    const mockLlm = async () => {
      return JSON.stringify({
        id: 'contact-intake',
        title: 'Customer Feedback',
        pages: [
          {
            id: 'step-1',
            title: 'Your Thoughts',
            fields: [
              {
                id: 'f-satisfaction',
                name: 'satisfaction',
                type: 'choice', // Hallucinated alias
                label: 'Overall Satisfaction',
                options: [
                  { label: 'Great', value: 'great' },
                  { label: 'Needs Improvement', value: 'poor' },
                ],
              },
            ],
          },
        ],
      });
    };

    const result = await compilePromptToSchema('Generate feedback form', mockLlm);
    expect(result.success).toBe(true);
    expect(result.schema).toBeDefined();
    expect(result.schema?.pages[0].fields[0].type).toBe('select');
  });
});
