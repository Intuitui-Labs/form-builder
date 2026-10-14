import { describe, it, expect } from 'vitest';
import { DeterministicHashExperimentAdapter } from '../../src/adapters/DeterministicHashExperimentAdapter.js';

describe('DeterministicHashExperimentAdapter - FNV-1a, Cryptographic Salt & QA Overrides', () => {
  it('achieves uniform distribution across buckets without modulo bias', () => {
    const adapter = new DeterministicHashExperimentAdapter();
    adapter.registerExperiment({
      experimentKey: 'checkout_v2',
      defaultVariant: 'control',
      variants: [
        { id: 'control', weight: 50 },
        { id: 'variant_b', weight: 50 },
      ],
    });

    let countB = 0;
    const totalSimulations = 2000;

    for (let i = 0; i < totalSimulations; i++) {
      const variant = adapter.getVariant('checkout_v2', { userId: `user_test_${i}` }, 'control');
      if (variant === 'variant_b') {
        countB++;
      }
    }

    const percentageB = (countB / totalSimulations) * 100;
    // For 50/50 split across 2000 users, percentage should comfortably be between 46% and 54%
    expect(percentageB).toBeGreaterThan(46);
    expect(percentageB).toBeLessThan(54);
  });

  it('per-experiment salt decorrelates assignments across related experiments', () => {
    const adapter = new DeterministicHashExperimentAdapter();

    adapter.registerExperiment({
      experimentKey: 'promo_banner',
      salt: 'salt_alpha_99',
      defaultVariant: 'v1',
      variants: [
        { id: 'v1', weight: 50 },
        { id: 'v2', weight: 50 },
      ],
    });

    adapter.registerExperiment({
      experimentKey: 'checkout_flow',
      salt: 'salt_beta_77',
      defaultVariant: 'v1',
      variants: [
        { id: 'v1', weight: 50 },
        { id: 'v2', weight: 50 },
      ],
    });

    // Check buckets for the same user across different salts
    let identicalBuckets = 0;
    const sampleSize = 500;

    for (let i = 0; i < sampleSize; i++) {
      const b1 = adapter.getBucket('promo_banner', { userId: `usr_${i}` });
      const b2 = adapter.getBucket('checkout_flow', { userId: `usr_${i}` });
      if (b1 === b2) identicalBuckets++;
    }

    // Two independent 0..99 buckets have an expected 1% collision rate (~5 out of 500)
    expect(identicalBuckets).toBeLessThan(25);
  });

  it('honors manual QA / developer overrides with highest priority', () => {
    const adapter = new DeterministicHashExperimentAdapter();
    adapter.registerExperiment({
      experimentKey: 'pricing_tier',
      defaultVariant: 'control',
      variants: [
        { id: 'control', weight: 100 },
        { id: 'enterprise_preview', weight: 0 },
      ],
    });

    // User normally always hashes to control (weight 100)
    expect(adapter.getVariant('pricing_tier', { userId: 'alice' }, 'control')).toBe('control');

    // Force override to preview variant for testing
    adapter.overrideVariant('pricing_tier', 'enterprise_preview');

    expect(adapter.getVariant('pricing_tier', { userId: 'alice' }, 'control')).toBe('enterprise_preview');
    const details = adapter.resolveDetails('pricing_tier', { userId: 'alice' }, 'control');
    expect(details.reason).toBe('OVERRIDE');
    expect(details.variant).toBe('enterprise_preview');

    // Clear overrides
    adapter.clearOverrides();
    expect(adapter.getVariant('pricing_tier', { userId: 'alice' }, 'control')).toBe('control');
  });
});
