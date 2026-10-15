import { describe, it, expect } from 'vitest';
import { SchemaPatchEngine, type SchemaPatchOp } from '../src/ai/SchemaPatchEngine.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('SchemaPatchEngine: Real Hardened AST Diff & Patch Mechanics', () => {
  const baseSchema: FormSchema = {
    v: '1.0',
    id: 'test-form',
    tenantId: 'test-tenant',
    title: 'Customer Onboarding',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'step-1',
        title: 'Basic Info',
        fields: [
          { id: 'f-1', name: 'full_name', type: 'text', label: 'Full Legal Name', required: true, order: 1 },
          { id: 'f-2', name: 'email', type: 'email', label: 'Email Address', required: true, order: 2 },
        ],
        jumpRules: [
          {
            condition: { field: 'email', operator: 'contains', value: '@enterprise.com' },
            targetPageId: 'step-enterprise',
          },
        ],
      },
      {
        id: 'step-enterprise',
        title: 'Enterprise Requirements',
        fields: [
          { id: 'f-3', name: 'seat_count', type: 'number', label: 'Expected Seats', required: true, order: 1 },
        ],
      },
      {
        id: 'step-2',
        title: 'Final Details',
        fields: [
          {
            id: 'f-4',
            name: 'referral_code',
            type: 'text',
            label: 'Referral Code',
            required: false,
            order: 1,
            visibleIf: { field: 'full_name', operator: 'notEmpty' },
          },
        ],
      },
    ],
  };

  it('atomically applies add, replace, and move operations', () => {
    const ops: SchemaPatchOp[] = [
      {
        op: 'add',
        path: '/pages/step-1/fields/2',
        value: { id: 'f-phone', name: 'phone', type: 'text', label: 'Mobile Phone', required: false, order: 3 },
      },
      {
        op: 'replace',
        path: '/pages/step-1/fields/full_name/label',
        value: 'Full Legal Name (as on Passport)',
      },
      {
        op: 'replace',
        path: '/title',
        value: 'Customer Onboarding v2',
      },
    ];

    const result = SchemaPatchEngine.applyPatch(baseSchema, ops);
    if (!result.success) console.error('TEST ERROR:', result.error);
    expect(result.success).toBe(true);
    expect(result.schema.title).toBe('Customer Onboarding v2');
    expect(result.schema.pages[0].fields).toHaveLength(3);
    expect(result.schema.pages[0].fields[0].label).toBe('Full Legal Name (as on Passport)');
    expect(result.schema.pages[0].fields[2].name).toBe('phone');
  });

  it('guarantees bidirectional rollback via generated inverseOps', () => {
    const ops: SchemaPatchOp[] = [
      {
        op: 'replace',
        path: '/title',
        value: 'Altered Title',
      },
      {
        op: 'replace',
        path: '/pages/step-1/fields/full_name/required',
        value: false,
      },
      {
        op: 'add',
        path: '/pages/step-enterprise/fields/1',
        value: { id: 'f-tier', name: 'sla_tier', type: 'text', label: 'SLA Tier', required: false, order: 2 },
      },
    ];

    const applyResult = SchemaPatchEngine.applyPatch(baseSchema, ops);
    expect(applyResult.success).toBe(true);
    expect(applyResult.inverseOps.length).toBeGreaterThan(0);

    // Apply inverse patches to mutated schema
    const rollbackResult = SchemaPatchEngine.applyPatch(applyResult.schema, applyResult.inverseOps);
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.schema.title).toBe(baseSchema.title);
    expect(rollbackResult.schema.pages[0].fields[0].required).toBe(true);
    expect(rollbackResult.schema.pages[1].fields).toHaveLength(1);
  });

  it('heals referential integrity when a page or field is removed', () => {
    const ops: SchemaPatchOp[] = [
      // Remove step-enterprise which is targeted by jump rule on step-1
      {
        op: 'remove',
        path: '/pages/step-enterprise',
      },
      // Remove full_name which is referenced by visibleIf in step-2
      {
        op: 'remove',
        path: '/pages/step-1/fields/full_name',
      },
    ];

    const result = SchemaPatchEngine.applyPatch(baseSchema, ops, { enforceReferentialIntegrity: true });
    expect(result.success).toBe(true);
    expect(result.prunedReferencesCount).toBe(2);

    // The jump rule targeting step-enterprise MUST be pruned
    expect(result.schema.pages[0].jumpRules).toBeUndefined();

    // The visibleIf condition on referral_code referencing full_name MUST be pruned
    const referralField = result.schema.pages[1].fields.find((f) => f.name === 'referral_code');
    expect(referralField?.visibleIf).toBeUndefined();
  });

  it('transactionally rolls back entire patch batch if post-validation fails', () => {
    const invalidOps: SchemaPatchOp[] = [
      { op: 'replace', path: '/title', value: 'New Valid Title' },
      {
        op: 'add',
        path: '/pages/step-1/fields/2',
        // Malformed field: missing required 'name' and 'type'
        value: { id: 'bad-field', label: 'Broken' },
      },
    ];

    const result = SchemaPatchEngine.applyPatch(baseSchema, invalidOps, { validatePostPatch: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Post-patch schema validation failed');
    // Original schema MUST remain untouched
    expect(result.schema.title).toBe(baseSchema.title);
    expect(result.schema.pages[0].fields).toHaveLength(2);
  });

  it('computes minimal diff between two schemas accurately', () => {
    const targetSchema: FormSchema = {
      ...baseSchema,
      title: 'Updated Header',
      pages: [
        {
          ...baseSchema.pages[0],
          fields: [
            { ...baseSchema.pages[0].fields[0], label: 'Updated Label' },
            // Removed email field
          ],
        },
        baseSchema.pages[1],
        baseSchema.pages[2],
      ],
    };

    const diffOps = SchemaPatchEngine.diff(baseSchema, targetSchema);
    expect(diffOps.length).toBeGreaterThan(0);

    // Applying the diff to baseSchema should produce targetSchema
    const applyDiff = SchemaPatchEngine.applyPatch(baseSchema, diffOps);
    expect(applyDiff.success).toBe(true);
    expect(applyDiff.schema.title).toBe('Updated Header');
    expect(applyDiff.schema.pages[0].fields).toHaveLength(1);
    expect(applyDiff.schema.pages[0].fields[0].label).toBe('Updated Label');
  });
});
