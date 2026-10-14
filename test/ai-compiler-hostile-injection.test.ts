import { describe, it, expect } from 'vitest';
import { normalizeAndHealSchema } from '../src/ai/SchemaCompiler.js';

describe('AI Schema Compiler - Hostile Injection & Rule Healing', () => {
  it('strips dangerous prototype pollution keys from raw input and field names', () => {
    const maliciousPayload = {
      __proto__: { polluted: true },
      constructor: { isEvil: true },
      prototype: { evilFunc: () => {} },
      id: 'polluted-form',
      title: 'Pollution Intake',
      pages: [
        {
          id: 'step-1',
          title: 'Step 1',
          fields: [
            {
              id: 'f-proto',
              name: '__proto__',
              type: 'text',
              label: 'Enter payload',
            },
            {
              id: 'f-constructor',
              name: 'constructor',
              type: 'text',
              label: 'Enter constructor',
            },
            {
              id: 'f-normal',
              name: 'username',
              type: 'text',
              label: 'Valid Username',
            },
          ],
        },
      ],
    };

    const healed = normalizeAndHealSchema(maliciousPayload);

    // Global prototype must not be polluted
    expect((Object.prototype as any).polluted).toBeUndefined();

    // Dangerous field names must be safely prefixed or sanitized
    const page1 = healed.pages[0];
    const fieldNames = page1.fields.map((f) => f.name);
    expect(fieldNames).not.toContain('__proto__');
    expect(fieldNames).not.toContain('constructor');
    expect(fieldNames).toContain('field___proto__');
    expect(fieldNames).toContain('field_constructor');
    expect(fieldNames).toContain('username');
  });

  it('heals object dictionary field mappings into valid FormField arrays', () => {
    const dictionaryPayload = {
      id: 'dict-form',
      title: 'Dictionary Fields Form',
      pages: [
        {
          id: 'step-applicant',
          title: 'Applicant Details',
          fields: {
            fullName: {
              id: 'f-name',
              type: 'text',
              label: 'Full Name',
            },
            userEmail: {
              id: 'f-email',
              type: 'email_address', // also test alias healing
              label: 'Email',
            },
            isEmployed: {
              type: 'switch', // also test switch healing
              label: 'Employed?',
            },
          },
        },
      ],
    };

    const healed = normalizeAndHealSchema(dictionaryPayload);
    const page = healed.pages[0];

    expect(Array.isArray(page.fields)).toBe(true);
    expect(page.fields.length).toBe(3);

    const emailField = page.fields.find((f) => f.name === 'userEmail');
    expect(emailField?.type).toBe('email');

    const switchField = page.fields.find((f) => f.name === 'isEmployed');
    expect(switchField?.type).toBe('select');
    expect(switchField?.options).toEqual([
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ]);
  });

  it('prunes self-loop jump rules and jumps targeting non-existent pages', () => {
    const cyclePayload = {
      id: 'cycle-form',
      title: 'Cyclic Form',
      pages: [
        {
          id: 'step-1',
          title: 'Step 1',
          fields: [{ name: 'q1', type: 'text' }],
          jumpRules: [
            {
              // Self-loop: jumping back to step-1
              condition: { field: 'q1', operator: 'equals', value: 'loop' },
              targetPageId: 'step-1',
            },
            {
              // Jumping to nonexistent phantom step
              condition: { field: 'q1', operator: 'equals', value: 'phantom' },
              targetPageId: 'step-phantom-99',
            },
            {
              // Valid jump to step-2
              condition: { field: 'q1', operator: 'equals', value: 'next' },
              targetPageId: 'step-2',
            },
          ],
          defaultNextPageId: 'step-1', // Invalid self-referential default
        },
        {
          id: 'step-2',
          title: 'Step 2',
          fields: [{ name: 'q2', type: 'text' }],
        },
      ],
    };

    const healed = normalizeAndHealSchema(cyclePayload);
    const step1 = healed.pages[0];

    // Self-loop and phantom jump must be pruned; only valid step-2 jump remains
    expect(step1.jumpRules).toBeDefined();
    expect(step1.jumpRules?.length).toBe(1);
    expect(step1.jumpRules?.[0].targetPageId).toBe('step-2');

    // Self-referential defaultNextPageId must be stripped
    expect(step1.defaultNextPageId).toBeUndefined();
  });
});
