import type { FormSchema, FormPage, FormField, FieldType } from './FormSchema.js';
import type { Condition, ConditionPredicate, CompoundCondition } from './FormBranching.js';

export interface SchemaGraphNode {
  id: string;
  kind: 'page' | 'field';
  label: string;
  pageId?: string; // Present on field nodes
  fieldType?: FieldType;
  required?: boolean;
  sensitive?: boolean;
  raw: FormPage | FormField;
}

export type SchemaGraphEdgeType =
  | 'page-transition'
  | 'page-jump'
  | 'field-visibility'
  | 'field-dependency';

export interface SchemaGraphEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  type: SchemaGraphEdgeType;
  metadata?: Record<string, unknown>;
}

export interface SchemaGraph {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
  pageMap: Map<string, FormPage>;
  fieldMap: Map<string, FormField>; // Keyed by field id and field name
  rootPageId: string | null;
}

/**
 * Recursively extracts all referenced field names or IDs from a branching condition.
 */
export function extractConditionFieldNames(condition?: Condition | null): string[] {
  if (!condition) return [];
  const fields: string[] = [];

  function walk(node: Condition): void {
    if ('field' in node && typeof (node as ConditionPredicate).field === 'string') {
      fields.push((node as ConditionPredicate).field);
    } else if ('predicates' in node && Array.isArray((node as CompoundCondition).predicates)) {
      for (const pred of (node as CompoundCondition).predicates) {
        walk(pred);
      }
    }
  }

  walk(condition);
  return Array.from(new Set(fields));
}

/**
 * Builds a Directed Acyclic Graph (DAG) / Directed Graph of pages, fields, and their relational dependencies.
 */
export function buildSchemaGraph(schema: FormSchema): SchemaGraph {
  const nodes: SchemaGraphNode[] = [];
  const edges: SchemaGraphEdge[] = [];
  const pageMap = new Map<string, FormPage>();
  const fieldMap = new Map<string, FormField>();

  const pages = schema.pages ?? [];
  const rootPageId = pages.length > 0 ? pages[0].id : null;

  // 1. Populate Nodes & Maps
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    pageMap.set(page.id, page);

    nodes.push({
      id: page.id,
      kind: 'page',
      label: page.title || `Page ${pageIdx + 1}`,
      raw: page,
    });

    for (const field of page.fields ?? []) {
      fieldMap.set(field.id, field);
      fieldMap.set(field.name, field); // Allow lookup by either ID or Name

      nodes.push({
        id: field.id,
        kind: 'field',
        label: field.label || field.name,
        pageId: page.id,
        fieldType: field.type,
        required: field.required,
        sensitive: field.sensitive,
        raw: field,
      });
    }
  }

  // 2. Populate Page Edges (Linear sequential + Explicit jump rules)
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Explicit Jump Rules
    if (page.jumpRules && Array.isArray(page.jumpRules)) {
      for (let j = 0; j < page.jumpRules.length; j++) {
        const jump = page.jumpRules[j];
        if (jump.targetPageId) {
          edges.push({
            id: `edge-jump-${page.id}->${jump.targetPageId}-${j}`,
            source: page.id,
            target: jump.targetPageId,
            type: 'page-jump',
            metadata: {
              condition: jump.condition,
            },
          });
        }
      }
    }

    // Default next or linear successor
    if (page.defaultNextPageId) {
      edges.push({
        id: `edge-transition-${page.id}->${page.defaultNextPageId}`,
        source: page.id,
        target: page.defaultNextPageId,
        type: 'page-transition',
        metadata: { isExplicitDefault: true },
      });
    } else if (i < pages.length - 1) {
      // Natural sequential progression to next page
      const nextPage = pages[i + 1];
      edges.push({
        id: `edge-transition-${page.id}->${nextPage.id}`,
        source: page.id,
        target: nextPage.id,
        type: 'page-transition',
        metadata: { isSequential: true },
      });
    }
  }

  // 3. Populate Field Edges (Visibility & Dependency)
  for (const page of pages) {
    for (const field of page.fields ?? []) {
      // Visibility Dependencies
      if (field.visibleIf) {
        const antecedentFields = extractConditionFieldNames(field.visibleIf);
        for (const antecedentName of antecedentFields) {
          const antecedentField = fieldMap.get(antecedentName);
          const sourceId = antecedentField ? antecedentField.id : antecedentName;
          edges.push({
            id: `edge-vis-${sourceId}->${field.id}`,
            source: sourceId,
            target: field.id,
            type: 'field-visibility',
            metadata: { condition: field.visibleIf },
          });
        }
      }

      // Explicit dependsOn dependencies (e.g. computed fields)
      if (field.dependsOn && Array.isArray(field.dependsOn)) {
        for (const depName of field.dependsOn) {
          const depField = fieldMap.get(depName);
          const sourceId = depField ? depField.id : depName;
          edges.push({
            id: `edge-dep-${sourceId}->${field.id}`,
            source: sourceId,
            target: field.id,
            type: 'field-dependency',
            metadata: { kind: 'dependsOn' },
          });
        }
      }

      if (field.computed?.dependsOn && Array.isArray(field.computed.dependsOn)) {
        for (const depName of field.computed.dependsOn) {
          const depField = fieldMap.get(depName);
          const sourceId = depField ? depField.id : depName;
          edges.push({
            id: `edge-computed-${sourceId}->${field.id}`,
            source: sourceId,
            target: field.id,
            type: 'field-dependency',
            metadata: { kind: 'computed' },
          });
        }
      }

      // Relational validation rules (matchesField, greaterThanField, lessThanField, requiredIfField)
      if (field.rules && Array.isArray(field.rules)) {
        for (const rule of field.rules) {
          if ('targetField' in rule && rule.targetField) {
            const target = fieldMap.get(rule.targetField);
            const sourceId = target ? target.id : rule.targetField;
            edges.push({
              id: `edge-rule-${sourceId}->${field.id}`,
              source: sourceId,
              target: field.id,
              type: 'field-dependency',
              metadata: { ruleType: rule.type },
            });
          }
        }
      }
    }
  }

  return {
    nodes,
    edges,
    pageMap,
    fieldMap,
    rootPageId,
  };
}

/**
 * Computes all page IDs reachable from the root page.
 */
export function getReachablePageIds(graph: SchemaGraph): Set<string> {
  const reachable = new Set<string>();
  if (!graph.rootPageId) return reachable;

  // Build adjacency list for page transitions and jumps
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === 'page-transition' || edge.type === 'page-jump') {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source)!.push(edge.target);
    }
  }

  const queue: string[] = [graph.rootPageId];
  reachable.add(graph.rootPageId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) ?? [];
    for (const next of neighbors) {
      if (!reachable.has(next) && graph.pageMap.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  return reachable;
}

/**
 * Detects directed cycles in the page transition graph.
 * Returns an array of cycles (e.g. [['p1', 'p2', 'p1']]).
 */
export function detectPageCycles(graph: SchemaGraph): string[][] {
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === 'page-transition' || edge.type === 'page-jump') {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source)!.push(edge.target);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adj.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!graph.pageMap.has(neighbor)) continue; // Skip dangling pointers (handled by linter)

      if (inStack.has(neighbor)) {
        // Found a cycle!
        const cycleStartIndex = path.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cyclePath = path.slice(cycleStartIndex).concat(neighbor);
          cycles.push(cyclePath);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }

    inStack.delete(nodeId);
    path.pop();
  }

  for (const pageId of graph.pageMap.keys()) {
    if (!visited.has(pageId)) {
      dfs(pageId);
    }
  }

  return cycles;
}

/**
 * Detects directed cyclic dependencies between fields.
 */
export function detectFieldCycles(graph: SchemaGraph): string[][] {
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type === 'field-visibility' || edge.type === 'field-dependency') {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      adj.get(edge.source)!.push(edge.target);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adj.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (!graph.fieldMap.has(neighbor)) continue;

      if (inStack.has(neighbor)) {
        const cycleStartIndex = path.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cyclePath = path.slice(cycleStartIndex).concat(neighbor);
          cycles.push(cyclePath);
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }

    inStack.delete(nodeId);
    path.pop();
  }

  for (const field of graph.nodes) {
    if (field.kind === 'field' && !visited.has(field.id)) {
      dfs(field.id);
    }
  }

  return cycles;
}
