import { describe, it, expect } from 'vitest';
import { runPersonaFuzzSimulation } from '../src/ai/index.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('PersonaFuzzer - Monte Carlo Multi-Path Stress Tester', () => {
  it('successfully exercises multi-step linear and branching forms across personas', async () => {
    const branchingSchema: FormSchema = {
      id: 'branching-onboarding',
      title: 'Customer Onboarding',
      pages: [
        {
          id: 'step-account',
          title: 'Account Type',
          fields: [
            {
              id: 'f-plan',
              name: 'plan_type',
              type: 'select',
              label: 'Plan Type',
              required: true,
              order: 1,
              options: [
                { label: 'Starter', value: 'starter' },
                { label: 'Enterprise', value: 'enterprise' },
              ],
            },
          ],
          jumpRules: [
            {
              condition: { field: 'plan_type', operator: 'equals', value: 'enterprise' },
              targetPageId: 'step-enterprise',
            },
          ],
          defaultNextPageId: 'step-starter',
        },
        {
          id: 'step-starter',
          title: 'Starter Setup',
          fields: [
            {
              id: 'f-team',
              name: 'team_size',
              type: 'number',
              label: 'Team Size',
              required: true,
              order: 1,
              min: 1,
              max: 10,
            },
          ],
          defaultNextPageId: 'step-finish',
        },
        {
          id: 'step-enterprise',
          title: 'Enterprise Setup',
          fields: [
            {
              id: 'f-sso',
              name: 'sso_provider',
              type: 'text',
              label: 'SSO Provider',
              required: true,
              order: 1,
            },
          ],
          defaultNextPageId: 'step-finish',
        },
        {
          id: 'step-finish',
          title: 'Confirmation',
          fields: [
            {
              id: 'f-confirm',
              name: 'agreed_to_terms',
              type: 'text',
              label: 'Confirmation Note',
              required: false,
              order: 1,
            },
          ],
        },
      ],
    };

    const report = await runPersonaFuzzSimulation(branchingSchema, 12);

    expect(report.totalSimulations).toBe(12);
    expect(report.successfulSimulations).toBe(12);
    expect(report.failedSimulations).toBe(0);

    // Verify both paths were explored
    const pathKeys = Object.keys(report.visitedPathDistribution);
    expect(pathKeys.length).toBeGreaterThanOrEqual(2);

    const exploredEnterprise = pathKeys.some((p) => p.includes('step-enterprise'));
    const exploredStarter = pathKeys.some((p) => p.includes('step-starter'));
    expect(exploredEnterprise).toBe(true);
    expect(exploredStarter).toBe(true);
  });

  it('detects unmeetable validation blockers on intermediate steps', async () => {
    const brokenSchema: FormSchema = {
      id: 'blocker-schema',
      title: 'Unmeetable Step Form',
      pages: [
        {
          id: 'step-impossible',
          title: 'Impossible Step',
          fields: [
            {
              id: 'f-impossible',
              name: 'magic_word',
              type: 'text',
              label: 'Secret',
              required: true,
              order: 1,
              rules: [
                {
                  type: 'pattern',
                  value: '^NEVER_MATCHABLE_XYZ_123$',
                  message: 'Must match secret',
                },
              ],
            },
          ],
        },
        {
          id: 'step-2',
          title: 'Step 2',
          fields: [{ id: 'f-2', name: 'f2', type: 'text', label: 'F2', required: false, order: 1 }],
        },
      ],
    };

    const report = await runPersonaFuzzSimulation(brokenSchema, 4);
    expect(report.totalSimulations).toBe(4);
    expect(report.failedSimulations).toBe(4);
    expect(report.results[0].error).toContain('Could not advance');
  });
});
