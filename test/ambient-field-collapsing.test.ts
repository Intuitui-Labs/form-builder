import { describe, it, expect } from 'vitest';
import { AmbientFieldCollapser, type FieldClusterDefinition } from '../src/affordance/AmbientFieldCollapser.js';

describe('AmbientFieldCollapser (Self-Shrinking Form Behavior)', () => {
  const addressCluster: FieldClusterDefinition = {
    id: 'address-cluster',
    title: 'Billing & Delivery Address',
    fieldNames: ['street', 'city', 'postalCode', 'country'],
    summaryFormatter: (values) =>
      `${values.street}, ${values.city} ${values.postalCode}, ${values.country}`,
  };

  const contactCluster: FieldClusterDefinition = {
    id: 'contact-cluster',
    title: 'Primary Contact',
    fieldNames: ['fullName', 'email', 'phone'],
  };

  it('keeps cluster uncollapsed when some fields are unpopulated', () => {
    const collapser = new AmbientFieldCollapser([addressCluster]);

    const values = {
      street: '42 Main St',
      city: 'Metropolis',
      postalCode: '', // missing
      country: 'USA',
    };

    const summaries = collapser.evaluateClusters(values, {});
    expect(summaries).toHaveLength(1);
    expect(summaries[0].isCollapsed).toBe(false);
  });

  it('collapses cluster into summary card once all fields are populated', () => {
    const collapser = new AmbientFieldCollapser([addressCluster]);

    const values = {
      street: '42 Main St',
      city: 'Metropolis',
      postalCode: '10001',
      country: 'USA',
    };

    const origins = {
      street: { origin: 'autofill-geo', timestamp: Date.now() },
      city: { origin: 'autofill-geo', timestamp: Date.now() },
    };

    const summaries = collapser.evaluateClusters(values, origins);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].isCollapsed).toBe(true);
    expect(summaries[0].autoResolved).toBe(true);
    expect(summaries[0].summaryText).toBe('42 Main St, Metropolis 10001, USA');
  });

  it('hostile focus defense: never collapses cluster while user has active focus on one of its fields', () => {
    const collapser = new AmbientFieldCollapser([addressCluster]);

    const values = {
      street: '42 Main St',
      city: 'Metropolis',
      postalCode: '10001',
      country: 'USA',
    };

    // User is actively editing or focusing on the street input
    const summaries = collapser.evaluateClusters(values, {}, 'street');
    expect(summaries[0].isCollapsed).toBe(false);

    // Focus on unrelated field allows collapse
    const unfocusedSummaries = collapser.evaluateClusters(values, {}, 'unrelatedField');
    expect(unfocusedSummaries[0].isCollapsed).toBe(true);
  });

  it('honors manual expansion for 1-click re-editing', () => {
    const collapser = new AmbientFieldCollapser([addressCluster]);

    const values = {
      street: '42 Main St',
      city: 'Metropolis',
      postalCode: '10001',
      country: 'USA',
    };

    // Initially collapsed
    expect(collapser.evaluateClusters(values, {})[0].isCollapsed).toBe(true);

    // User clicks "Edit" to manually expand
    collapser.expandCluster('address-cluster');
    expect(collapser.isClusterExpanded('address-cluster')).toBe(true);
    expect(collapser.evaluateClusters(values, {})[0].isCollapsed).toBe(false);

    // User clicks "Done" or collapses
    collapser.collapseCluster('address-cluster');
    expect(collapser.isClusterExpanded('address-cluster')).toBe(false);
    expect(collapser.evaluateClusters(values, {})[0].isCollapsed).toBe(true);
  });

  it('formats fallback summary using bullet delimiter when no custom formatter is provided', () => {
    const collapser = new AmbientFieldCollapser([contactCluster]);

    const values = {
      fullName: 'Sarah Connor',
      email: 'sarah@resistance.org',
      phone: '+1 555 0199',
    };

    const summaries = collapser.evaluateClusters(values, {});
    expect(summaries[0].isCollapsed).toBe(true);
    expect(summaries[0].summaryText).toBe('Sarah Connor · sarah@resistance.org · +1 555 0199');
  });
});
