import { describe, it, expect } from 'vitest';
import {
  sanitizeAndParseJson,
  compilePromptToSchema,
  type LlmCompletionCaller,
} from '../src/ai/index.js';

describe('AI SchemaCompiler & Defensive Sanitizer', () => {
  it('strips markdown code fences and handles trailing commas gracefully', () => {
    const rawMarkdownResponse = `
Here is the requested schema:
\`\`\`json
{
  "id": "vendor-security-intake",
  "title": "Vendor Security Review",
  "pages": [
    {
      "id": "step-company",
      "title": "Company Details",
      "fields": [
        {
          "id": "f-name",
          "name": "company_name",
          "type": "text",
          "label": "Company Name",
          "required": true,
          "order": 1,
        },
      ],
    },
  ],
}
\`\`\`
Hope this helps!`;

    const result = sanitizeAndParseJson<{ id: string; title: string; pages: unknown[] }>(
      rawMarkdownResponse
    );
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('vendor-security-intake');
    expect(result.data?.pages).toHaveLength(1);
  });

  it('rejects malformed unrecoverable JSON without throwing exceptions', () => {
    const broken = 'I am an AI and I cannot generate that schema for you: { "id": broken ';
    const result = sanitizeAndParseJson(broken);
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON parse error');
  });

  it('successfully compiles a valid schema through the full validation and linting pipeline', async () => {
    const mockLlm: LlmCompletionCaller = async (_systemPrompt, userPrompt) => {
      return JSON.stringify({
        id: 'contact-intake',
        title: 'Contact Us',
        description: `Generated for: ${userPrompt}`,
        pages: [
          {
            id: 'step-contact',
            title: 'Contact Information',
            fields: [
              {
                id: 'f-email',
                name: 'work_email',
                type: 'email',
                label: 'Work Email',
                required: true,
                order: 1,
                semanticIntent: 'contact-email',
              },
            ],
          },
        ],
      });
    };

    const result = await compilePromptToSchema('Create an enterprise contact form', mockLlm);
    expect(result.success).toBe(true);
    expect(result.schema?.id).toBe('contact-intake');
    expect(result.schema?.pages[0].fields[0].semanticIntent).toBe('contact-email');
  });

  it('catches and blocks hallucinated schema structures or invalid operators via Zod gate', async () => {
    const invalidLlm: LlmCompletionCaller = async () => {
      return JSON.stringify({
        id: 'bad-schema',
        // Missing title!
        pages: [
          {
            id: 'step-1',
            fields: [
              {
                id: 'f-1',
                name: 'field_1',
                type: 'unsupported-type-hallucinated', // Invalid field type!
                label: 'Test',
                required: true,
                order: 1,
              },
            ],
          },
        ],
      });
    };

    const result = await compilePromptToSchema('Generate test form', invalidLlm);
    expect(result.success).toBe(false);
    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors?.length).toBeGreaterThan(0);
  });

  it('blocks schemas containing circular jump loops through the hostile lint gate', async () => {
    const cyclicLlm: LlmCompletionCaller = async () => {
      return JSON.stringify({
        id: 'cycle-form',
        title: 'Infinite Loop Form',
        pages: [
          {
            id: 'step-a',
            defaultNextPageId: 'step-b',
            fields: [{ id: 'f-a', name: 'fa', type: 'text', label: 'FA', required: true, order: 1 }],
          },
          {
            id: 'step-b',
            defaultNextPageId: 'step-a', // Cycle back to A!
            fields: [{ id: 'f-b', name: 'fb', type: 'text', label: 'FB', required: true, order: 1 }],
          },
        ],
      });
    };

    const result = await compilePromptToSchema('Generate wizard', cyclicLlm);
    expect(result.success).toBe(false);
    expect(result.lintIssues?.some((i) => i.code === 'PAGE_CYCLE_DETECTED')).toBe(true);
  });
});
