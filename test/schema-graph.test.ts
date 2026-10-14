import { describe, it, expect } from 'vitest';
import {
  buildSchemaGraph,
  getReachablePageIds,
  detectPageCycles,
  detectFieldCycles,
} from '../src/schema/SchemaGraph.js';
import type { FormSchema } from '../src/schema/FormSchema.js';

describe('SchemaGraph Engine', () => {
  it('builds nodes and edges for linear multi-step forms', () => {
    const schema: FormSchema = {
      id: 'linear-form',
      title: 'Linear Form',
      pages: [
        {
          id: 'step-1',
          title: 'Step 1',
          fields: [
            { id: 'f-1', name: 'first_name', type: 'text', label: 'First Name', required: true, order: 1 },
          ],
        },
        {
          id: 'step-2',
          title: 'Step 2',
          fields: [
            { id: 'f-2', name: 'email', type: 'email', label: 'Email', required: true, order: 1 },
          ],
        },
      ],
    };

    const graph = buildSchemaGraph(schema);
    expect(graph.nodes.length).toBe(4); // 2 pages + 2 fields
    expect(graph.rootPageId).toBe('step-1');

    const reachable = getReachablePageIds(graph);
    expect(reachable.has('step-1')).toBe(true);
    expect(reachable.has('step-2')).toBe(true);

    const pageCycles = detectPageCycles(graph);
    expect(pageCycles).toHaveLength(0);
  });

  it('detects reachable pages across dynamic jump rules', () => {
    const schema: FormSchema = {
      id: 'jump-form',
      title: 'Branching Form',
      pages: [
        {
          id: 'step-intro',
          jumpRules: [
            {
              condition: { field: 'role', operator: 'equals', value: 'enterprise' },
              targetPageId: 'step-enterprise',
            },
          ],
          defaultNextPageId: 'step-standard',
          fields: [
            { id: 'f-role', name: 'role', type: 'select', label: 'Role', required: true, order: 1 },
          ],
        },
        {
          id: 'step-standard',
          fields: [
            { id: 'f-std', name: 'team_size', type: 'number', label: 'Team Size', required: false, order: 1 },
          ],
        },
        {
          id: 'step-enterprise',
          defaultNextPageId: 'step-standard',
          fields: [
            { id: 'f-ent', name: 'sso_provider', type: 'text', label: 'SSO Provider', required: true, order: 1 },
          ],
        },
        {
          id: 'step-orphan',
          fields: [
            { id: 'f-orphan', name: 'orphan_input', type: 'text', label: 'Unreachable', required: false, order: 1 },
          ],
        },
      ],
    };

    const graph = buildSchemaGraph(schema);
    const reachable = getReachablePageIds(graph);

    expect(reachable.has('step-intro')).toBe(true);
    expect(reachable.has('step-standard')).toBe(true);
    expect(reachable.has('step-enterprise')).toBe(true);
    expect(reachable.has('step-orphan')).toBe(false);
  });

  it('detects circular page navigation loops', () => {
    const schema: FormSchema = {
      id: 'cycle-form',
      title: 'Cycle Form',
      pages: [
        {
          id: 'page-a',
          jumpRules: [
            {
              condition: { field: 'answer', operator: 'equals', value: 'loop' },
              targetPageId: 'page-b',
            },
          ],
          fields: [{ id: 'f-a', name: 'answer', type: 'text', label: 'A', required: true, order: 1 }],
        },
        {
          id: 'page-b',
          jumpRules: [
            {
              condition: { field: 'answer', operator: 'equals', value: 'loop' },
              targetPageId: 'page-a',
            },
          ],
          fields: [{ id: 'f-b', name: 'b', type: 'text', label: 'B', required: true, order: 1 }],
        },
      ],
    };

    const graph = buildSchemaGraph(schema);
    const cycles = detectPageCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('page-a');
    expect(cycles[0]).toContain('page-b');
  });

  it('detects circular field dependencies (e.g. mutual visibleIf or computed)', () => {
    const schema: FormSchema = {
      id: 'field-cycle-form',
      title: 'Field Cycle Form',
      pages: [
        {
          id: 'page-1',
          fields: [
            {
              id: 'f-alpha',
              name: 'alpha',
              type: 'text',
              label: 'Alpha',
              required: false,
              order: 1,
              visibleIf: { field: 'beta', operator: 'equals', value: 'yes' },
            },
            {
              id: 'f-beta',
              name: 'beta',
              type: 'text',
              label: 'Beta',
              required: false,
              order: 2,
              visibleIf: { field: 'alpha', operator: 'equals', value: 'yes' },
            },
          ],
        },
      ],
    };

    const graph = buildSchemaGraph(schema);
    const fieldCycles = detectFieldCycles(graph);
    expect(fieldCycles.length).toBeGreaterThan(0);
  });
});
