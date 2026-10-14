import { describe, it, expect, vi } from 'vitest';
import {
  MemoryExperimentAdapter,
  DeterministicHashExperimentAdapter,
  CallbackExperimentAdapter,
  type ExperimentContext,
} from '../../src/adapters/index.js';

describe('MemoryExperimentAdapter', () => {
  it('correctly reads flags, variants, and defaults synchronously', () => {
    const adapter = new MemoryExperimentAdapter({
      flags: { 'beta-feature': true, 'deprecated-feature': false },
      variants: { 'checkout-flow': 'accordion' },
    });

    const ctx: ExperimentContext = { userId: 'usr-1' };

    expect(adapter.isEnabled('beta-feature', ctx)).toBe(true);
    expect(adapter.isEnabled('deprecated-feature', ctx)).toBe(false);
    expect(adapter.isEnabled('non-existent-flag', ctx, true)).toBe(true);
    expect(adapter.isEnabled('non-existent-flag', ctx, false)).toBe(false);

    expect(adapter.getVariant('checkout-flow', ctx, 'control')).toBe('accordion');
    expect(adapter.getVariant('unknown-experiment', ctx, 'control')).toBe('control');
  });

  it('records exposure events with timestamps and context', () => {
    const onExposure = vi.fn();
    const adapter = new MemoryExperimentAdapter({ onExposure });

    const ctx: ExperimentContext = { userId: 'usr-42', devicePlatform: 'ios' };
    adapter.trackExposure('onboarding-wizard', 'step-reward', ctx);

    expect(onExposure).toHaveBeenCalledTimes(1);
    const exposures = adapter.getRecordedExposures();
    expect(exposures).toHaveLength(1);
    expect(exposures[0].experimentKey).toBe('onboarding-wizard');
    expect(exposures[0].variantId).toBe('step-reward');
    expect(exposures[0].context.userId).toBe('usr-42');
  });

  it('supports runtime mutability via setFlag and setVariant', () => {
    const adapter = new MemoryExperimentAdapter();
    const ctx: ExperimentContext = {};

    expect(adapter.isEnabled('dark-mode', ctx)).toBe(false);
    adapter.setFlag('dark-mode', true);
    expect(adapter.isEnabled('dark-mode', ctx)).toBe(true);

    adapter.setVariant('color-scheme', 'nord');
    expect(adapter.getVariant('color-scheme', ctx, 'default')).toBe('nord');
  });
});

describe('DeterministicHashExperimentAdapter', () => {
  it('deterministically assigns the same user to the same variant every time', () => {
    const adapter = new DeterministicHashExperimentAdapter({
      experiments: [
        {
          experimentKey: 'registration-flow',
          variants: [
            { id: 'control', weight: 50 },
            { id: 'variant-b', weight: 50 },
          ],
          defaultVariant: 'control',
        },
      ],
    });

    const ctx1: ExperimentContext = { userId: 'alice@example.com' };
    const ctx2: ExperimentContext = { userId: 'bob@example.com' };

    const aliceVariant1 = adapter.getVariant('registration-flow', ctx1, 'control');
    const aliceVariant2 = adapter.getVariant('registration-flow', ctx1, 'control');
    expect(aliceVariant1).toBe(aliceVariant2);

    const bobVariant1 = adapter.getVariant('registration-flow', ctx2, 'control');
    const bobVariant2 = adapter.getVariant('registration-flow', ctx2, 'control');
    expect(bobVariant1).toBe(bobVariant2);
  });

  it('respects targeting predicates before bucketing', () => {
    const adapter = new DeterministicHashExperimentAdapter({
      experiments: [
        {
          experimentKey: 'eu-compliance-flow',
          targeting: (ctx) => ctx.country === 'DE' || ctx.country === 'FR',
          variants: [
            { id: 'strict', weight: 100 },
          ],
          defaultVariant: 'standard',
        },
      ],
    });

    expect(adapter.getVariant('eu-compliance-flow', { userId: 'u1', country: 'DE' }, 'standard')).toBe('strict');
    expect(adapter.getVariant('eu-compliance-flow', { userId: 'u2', country: 'US' }, 'standard')).toBe('standard');
  });

  it('distributes 1,000 synthetic users close to the target 50/50 split', () => {
    const adapter = new DeterministicHashExperimentAdapter({
      experiments: [
        {
          experimentKey: 'ab-split-test',
          variants: [
            { id: 'A', weight: 50 },
            { id: 'B', weight: 50 },
          ],
          defaultVariant: 'A',
        },
      ],
    });

    let countA = 0;
    let countB = 0;

    for (let i = 0; i < 1000; i++) {
      const v = adapter.getVariant('ab-split-test', { userId: `user_${i}` }, 'A');
      if (v === 'A') countA++;
      else countB++;
    }

    // Expect reasonable statistical spread (e.g. 450 to 550 out of 1000)
    expect(countA).toBeGreaterThan(440);
    expect(countA).toBeLessThan(560);
    expect(countB).toBeGreaterThan(440);
    expect(countB).toBeLessThan(560);
  });
});

describe('CallbackExperimentAdapter (Modern Flag Platforms)', () => {
  it('simulates Statsig checkGate, getExperiment, and logExposure', () => {
    const fakeStatsigClient = {
      checkGate: vi.fn((gateName: string) => gateName === 'passkey_enabled'),
      getExperiment: vi.fn((expName: string) => ({
        get: (param: string, fallback: string) => (expName === 'intake_v2' ? 'multi-step' : fallback),
      })),
      logExposure: vi.fn(),
    };

    const adapter = new CallbackExperimentAdapter(
      {
        isEnabled: (key, ctx) => fakeStatsigClient.checkGate(key),
        getVariant: (key, ctx, def) => fakeStatsigClient.getExperiment(key).get('variant', String(def)),
        trackExposure: (key, variant, ctx) => fakeStatsigClient.logExposure(key, { variant, user: ctx.userId }),
      },
      'StatsigAdapter',
    );

    const ctx: ExperimentContext = { userId: 'statsig_user_1' };

    expect(adapter.isEnabled('passkey_enabled', ctx)).toBe(true);
    expect(adapter.isEnabled('faceid_enabled', ctx)).toBe(false);
    expect(adapter.getVariant('intake_v2', ctx, 'control')).toBe('multi-step');

    adapter.trackExposure?.('intake_v2', 'multi-step', ctx);
    expect(fakeStatsigClient.logExposure).toHaveBeenCalledWith('intake_v2', {
      variant: 'multi-step',
      user: 'statsig_user_1',
    });
  });

  it('simulates GrowthBook run() and trackingCallback', () => {
    const growthBookTracking = vi.fn();
    const fakeGrowthBook = {
      run: (experiment: { key: string }) => {
        if (experiment.key === 'form_style') {
          return { inExperiment: true, variationId: 'floating-labels', value: 'floating' };
        }
        return { inExperiment: false, variationId: 'control', value: 'standard' };
      },
    };

    const adapter = new CallbackExperimentAdapter({
      getVariant: (key) => fakeGrowthBook.run({ key }).value,
      trackExposure: (key, variant, ctx) => growthBookTracking(key, variant, ctx),
    });

    const ctx: ExperimentContext = { userId: 'gb-user-8' };
    expect(adapter.getVariant('form_style', ctx, 'standard')).toBe('floating');

    adapter.trackExposure?.('form_style', 'floating', ctx);
    expect(growthBookTracking).toHaveBeenCalledWith('form_style', 'floating', ctx);
  });

  it('simulates Vercel Flags SDK precomputed flags bag', () => {
    const vercelPrecomputedBag: Record<string, any> = {
      'new-signup-flow': true,
      'pricing-tier-experiment': 'enterprise-lead',
    };

    const adapter = new CallbackExperimentAdapter({
      isEnabled: (key) => Boolean(vercelPrecomputedBag[key]),
      getVariant: (key, ctx, def) => vercelPrecomputedBag[key] ?? def,
    });

    const ctx: ExperimentContext = {};
    expect(adapter.isEnabled('new-signup-flow', ctx)).toBe(true);
    expect(adapter.isEnabled('unreleased-flow', ctx)).toBe(false);
    expect(adapter.getVariant('pricing-tier-experiment', ctx, 'default')).toBe('enterprise-lead');
  });
});
