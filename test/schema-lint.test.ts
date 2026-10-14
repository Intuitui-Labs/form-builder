import { describe, it, expect } from 'vitest';
import { lintFormSchema } from '../src/schema/SchemaLint.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('SchemaLint - Hostile Critic & Heuristic Validator', () => {
  it('validates a well-formed enterprise schema cleanly', () => {
    const schema: FormSchema = {
      id: 'clean-enterprise-form',
      title: 'Customer Onboarding',
      pages: [
        {
          id: 'step-contact',
          title: 'Contact Information',
          fields: [
            {
              id: 'f-email',
              name: 'email',
              type: 'email',
              label: 'Work Email',
              required: true,
              order: 1,
              semanticIntent: 'contact-email',
              autoComplete: 'email',
            },
            {
              id: 'f-phone',
              name: 'phone',
              type: 'text',
              label: 'Direct Phone',
              required: false,
              order: 2,
              semanticIntent: 'contact-phone',
              privacyRationale: 'We only use your number to send critical SMS delivery notifications.',
            },
          ],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('flags orphan unreachable pages', () => {
    const schema: FormSchema = {
      id: 'orphan-test-form',
      title: 'Orphan Test',
      pages: [
        {
          id: 'step-1',
          defaultNextPageId: 'step-3',
          fields: [{ id: 'f-1', name: 'q1', type: 'text', label: 'Q1', required: true, order: 1 }],
        },
        {
          id: 'step-2-orphan',
          fields: [{ id: 'f-2', name: 'q2', type: 'text', label: 'Q2', required: true, order: 1 }],
        },
        {
          id: 'step-3',
          fields: [{ id: 'f-3', name: 'q3', type: 'text', label: 'Q3', required: true, order: 1 }],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(false);
    const orphanIssue = result.errors.find((e) => e.code === 'ORPHAN_PAGE');
    expect(orphanIssue).toBeDefined();
    expect(orphanIssue?.targetId).toBe('step-2-orphan');
  });

  it('flags circular page navigation loops', () => {
    const schema: FormSchema = {
      id: 'cycle-test-form',
      title: 'Cycle Test',
      pages: [
        {
          id: 'page-1',
          defaultNextPageId: 'page-2',
          fields: [{ id: 'f-1', name: 'f1', type: 'text', label: 'F1', required: true, order: 1 }],
        },
        {
          id: 'page-2',
          defaultNextPageId: 'page-1',
          fields: [{ id: 'f-2', name: 'f2', type: 'text', label: 'F2', required: true, order: 1 }],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PAGE_CYCLE_DETECTED')).toBe(true);
  });

  it('flags duplicate page and field identifiers', () => {
    const schema: FormSchema = {
      id: 'dup-test',
      title: 'Duplicate Test',
      pages: [
        {
          id: 'page-1',
          fields: [
            { id: 'f-same', name: 'field_one', type: 'text', label: '1', required: true, order: 1 },
            { id: 'f-same', name: 'field_one', type: 'text', label: '2', required: true, order: 2 },
          ],
        },
        {
          id: 'page-1',
          fields: [
            { id: 'f-other', name: 'other', type: 'text', label: '3', required: true, order: 1 },
          ],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_FIELD_NAME')).toBe(true);
  });

  it('catches vulnerable ReDoS regular expressions and syntax errors', () => {
    const schema: FormSchema = {
      id: 'regex-test',
      title: 'Regex Safety Test',
      pages: [
        {
          id: 'page-1',
          fields: [
            {
              id: 'f-redos',
              name: 'malicious_input',
              type: 'text',
              label: 'Input',
              required: true,
              order: 1,
              rules: [
                {
                  type: 'pattern',
                  value: '([a-zA-Z]+)+', // Classic nested quantifier ReDoS
                  message: 'Must match',
                },
              ],
            },
            {
              id: 'f-syntax-err',
              name: 'broken_regex',
              type: 'text',
              label: 'Broken',
              required: false,
              order: 2,
              rules: [
                {
                  type: 'pattern',
                  value: '[a-z', // Unclosed bracket syntax error
                  message: 'Broken syntax',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'VULNERABLE_REGEX')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_REGEX')).toBe(true);
  });

  it('flags sensitive fields missing privacy rationale (Baymard 37% abandonment heuristic)', () => {
    const schema: FormSchema = {
      id: 'privacy-test',
      title: 'Privacy Test',
      pages: [
        {
          id: 'page-1',
          fields: [
            {
              id: 'f-ssn',
              name: 'tax_id',
              type: 'text',
              label: 'Social Security Number',
              required: true,
              order: 1,
              semanticIntent: 'identity-tax-id',
              sensitive: true,
              // Missing privacyRationale!
            },
          ],
        },
      ],
    };

    const result = lintFormSchema(schema);
    // Warning, not blocking error
    const privacyWarning = result.warnings.find((w) => w.code === 'MISSING_PRIVACY_RATIONALE');
    expect(privacyWarning).toBeDefined();
    expect(privacyWarning?.targetId).toBe('f-ssn');
  });

  it('flags cognitive overload when a step has > 10 dense interactive fields', () => {
    const denseFields = Array.from({ length: 12 }, (_, i) => ({
      id: `f-${i + 1}`,
      name: `field_${i + 1}`,
      type: 'text' as const,
      label: `Field ${i + 1}`,
      required: true,
      order: i + 1,
    }));

    const schema: FormSchema = {
      id: 'cognitive-load-test',
      title: 'Overload Form',
      pages: [
        {
          id: 'page-dense',
          title: 'Heavy Page',
          fields: denseFields,
        },
      ],
    };

    const result = lintFormSchema(schema);
    const overloadWarning = result.warnings.find((w) => w.code === 'COGNITIVE_OVERLOAD_STEP');
    expect(overloadWarning).toBeDefined();
    expect(overloadWarning?.targetId).toBe('page-dense');
  });

  it('flags references to unknown dependency or jump fields', () => {
    const schema: FormSchema = {
      id: 'unknown-dep-test',
      title: 'Unknown Dep',
      pages: [
        {
          id: 'step-1',
          jumpRules: [
            {
              condition: { field: 'phantom_field', operator: 'equals', value: 123 },
              targetPageId: 'non_existent_page',
            },
          ],
          fields: [
            {
              id: 'f-1',
              name: 'f1',
              type: 'text',
              label: 'F1',
              required: true,
              order: 1,
              visibleIf: { field: 'ghost_antecedent', operator: 'equals', value: 'yes' },
            },
          ],
        },
      ],
    };

    const result = lintFormSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_TARGET_PAGE')).toBe(true);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_DEPENDENCY_FIELD')).toBe(true);
  });
});
