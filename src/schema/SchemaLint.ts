import type { FormSchema } from './FormSchema.js';
import {
  buildSchemaGraph,
  getReachablePageIds,
  detectPageCycles,
  detectFieldCycles,
  extractConditionFieldNames,
} from './SchemaGraph.js';
import { calculateFieldQuantumDensity } from '../ports/ISpatialAffordancePort.js';

export type SchemaLintIssueCode =
  | 'ORPHAN_PAGE'
  | 'PAGE_CYCLE_DETECTED'
  | 'FIELD_CYCLE_DETECTED'
  | 'INVALID_TARGET_PAGE'
  | 'DUPLICATE_ID'
  | 'DUPLICATE_FIELD_NAME'
  | 'UNKNOWN_DEPENDENCY_FIELD'
  | 'INVALID_REGEX'
  | 'VULNERABLE_REGEX'
  | 'MISSING_PRIVACY_RATIONALE'
  | 'MISSING_SEMANTIC_INTENT'
  | 'COGNITIVE_OVERLOAD_STEP'
  | 'SPATIAL_DENSITY_EXCEEDED'
  | 'GESTALT_PROXIMITY_COLLAPSE'
  | 'EMPTY_PAGE';

export type SchemaLintSeverity = 'error' | 'warning' | 'info';

export interface SchemaLintIssue {
  code: SchemaLintIssueCode;
  severity: SchemaLintSeverity;
  message: string;
  targetId: string;
  targetType: 'page' | 'field' | 'schema';
  heuristicSource?: string;
  suggestion?: string;
}

export interface SchemaLintResult {
  valid: boolean; // false if any issue with severity === 'error'
  errors: SchemaLintIssue[];
  warnings: SchemaLintIssue[];
  infos: SchemaLintIssue[];
  issues: SchemaLintIssue[];
}

/**
 * Common ReDoS (Regular Expression Denial of Service) heuristic detector.
 * Identifies nested quantifiers such as (a+)+, (.*a)+, ([0-9]+)+, etc.
 */
function checkReDoS(pattern: string): boolean {
  // Regex pattern matching nested repetitions: e.g. (...+)+ or (...*)*
  const nestedQuantifiersPattern = /\([^)]*(\+|\*|\{\d+,?\d*\})[^)]*\)(\+|\*|\{\d+,?\d*\})/;
  if (nestedQuantifiersPattern.test(pattern)) {
    return true;
  }
  // Alternating overlapping terms with quantifier: (a|a)+
  const overlappingAlternationPattern = /\((.+)\|(\1)\)(\+|\*)/;
  if (overlappingAlternationPattern.test(pattern)) {
    return true;
  }
  return false;
}

/**
 * Exhaustive heuristic and structural linter for FormSchema.
 * Evaluates the schema through the lens of a Senior Architect and Hostile Critic.
 */
export function lintFormSchema(schema: FormSchema): SchemaLintResult {
  const issues: SchemaLintIssue[] = [];
  const graph = buildSchemaGraph(schema);
  const pages = schema.pages ?? [];

  // 1. Basic Schema ID & Structure
  if (!schema.id || schema.id.trim() === '') {
    issues.push({
      code: 'DUPLICATE_ID',
      severity: 'error',
      message: 'Form schema must have a valid non-empty id',
      targetId: 'schema',
      targetType: 'schema',
    });
  }

  // 2. Duplicate Page IDs & Empty Pages
  const seenPageIds = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (seenPageIds.has(page.id)) {
      issues.push({
        code: 'DUPLICATE_ID',
        severity: 'error',
        message: `Duplicate page id detected: "${page.id}"`,
        targetId: page.id,
        targetType: 'page',
      });
    } else {
      seenPageIds.add(page.id);
    }

    if (!page.fields || page.fields.length === 0) {
      issues.push({
        code: 'EMPTY_PAGE',
        severity: 'warning',
        message: `Page "${page.id}" contains no fields`,
        targetId: page.id,
        targetType: 'page',
      });
    }

    // Cognitive Overload Heuristic (> 10 dense interactive fields)
    const interactiveFields = (page.fields ?? []).filter(
      (f) => f.type !== 'heading' && f.type !== 'divider' && f.type !== 'statement'
    );
    if (interactiveFields.length > 10) {
      issues.push({
        code: 'COGNITIVE_OVERLOAD_STEP',
        severity: 'warning',
        message: `Page "${page.id}" contains ${interactiveFields.length} interactive fields, exceeding the recommended maximum of 10 fields per step.`,
        targetId: page.id,
        targetType: 'page',
        heuristicSource: 'Baymard Institute / Nielsen Norman Group Cognitive Load Heuristics',
        suggestion: 'Consider splitting this step into multiple progressive steps.',
      });
    }

    // Spatial Density Heuristic (Quantum Density Units > 16)
    const pageQdu = calculateFieldQuantumDensity(page.fields ?? []);
    if (pageQdu > 16) {
      issues.push({
        code: 'SPATIAL_DENSITY_EXCEEDED',
        severity: 'warning',
        message: `Page "${page.id}" spatial density (${pageQdu} QDU) exceeds comfortable capacity (16 QDU). Dense fields, stacked options, and text hotspots eat the spacious feel.`,
        targetId: page.id,
        targetType: 'page',
        heuristicSource: 'Intuitui Labs Spatial Affordance & Gestalt Architecture Engine',
        suggestion: 'Consider splitting this step into progressive disclosure sub-steps or applying ambient field collapsing.',
      });
    }

    // Gestalt Proximity Collapse Heuristic: Multiple high-mass fields without visual rhythm/headings
    const highMassFields = (page.fields ?? []).filter(
      (f) =>
        f.type === 'visualization' ||
        f.type === 'file' ||
        f.type === 'image-capture' ||
        f.type === 'audio-record' ||
        f.type === 'rich-text'
    );
    const headingCount = (page.fields ?? []).filter((f) => f.type === 'heading' || f.type === 'divider').length;
    if (highMassFields.length >= 2 && headingCount === 0 && page.fields.length > 4) {
      issues.push({
        code: 'GESTALT_PROXIMITY_COLLAPSE',
        severity: 'info',
        message: `Page "${page.id}" groups ${highMassFields.length} high-mass complex fields without visual rhythm or section dividers.`,
        targetId: page.id,
        targetType: 'page',
        heuristicSource: 'Gestalt Law of Enclosure & Spatial Rhythm',
        suggestion: 'Introduce card wrappers, section dividers, or headings to establish clear visual grouping.',
      });
    }
  }

  // 3. Duplicate Field IDs & Duplicate Field Names
  const seenFieldIds = new Set<string>();
  const seenFieldNames = new Set<string>();
  const allFieldNames = new Set<string>();
  const allFieldIds = new Set<string>();

  for (const page of pages) {
    for (const field of page.fields ?? []) {
      allFieldIds.add(field.id);
      allFieldNames.add(field.name);

      if (seenFieldIds.has(field.id)) {
        issues.push({
          code: 'DUPLICATE_ID',
          severity: 'error',
          message: `Duplicate field id detected: "${field.id}"`,
          targetId: field.id,
          targetType: 'field',
        });
      } else {
        seenFieldIds.add(field.id);
      }

      if (seenFieldNames.has(field.name)) {
        issues.push({
          code: 'DUPLICATE_FIELD_NAME',
          severity: 'error',
          message: `Duplicate field name detected: "${field.name}". Form submissions will collide.`,
          targetId: field.id,
          targetType: 'field',
        });
      } else {
        seenFieldNames.add(field.name);
      }

      // Check Regex Safety in validation rules
      if (field.rules && Array.isArray(field.rules)) {
        for (const rule of field.rules) {
          if (rule.type === 'pattern' && typeof rule.value === 'string') {
            try {
              new RegExp(rule.value);
            } catch (err) {
              issues.push({
                code: 'INVALID_REGEX',
                severity: 'error',
                message: `Field "${field.name}" has invalid regex pattern "${rule.value}": ${(err as Error).message}`,
                targetId: field.id,
                targetType: 'field',
              });
              continue;
            }

            if (checkReDoS(rule.value)) {
              issues.push({
                code: 'VULNERABLE_REGEX',
                severity: 'error',
                message: `Field "${field.name}" contains vulnerable regex pattern "${rule.value}" susceptible to ReDoS catastrophic backtracking.`,
                targetId: field.id,
                targetType: 'field',
                heuristicSource: 'CWE-1333: Inefficient Regular Expression Complexity',
                suggestion: 'Simplify regex by eliminating nested or overlapping quantifiers.',
              });
            }
          }

          // Check Relational rule targets
          if ('targetField' in rule && rule.targetField) {
            if (!allFieldNames.has(rule.targetField) && !allFieldIds.has(rule.targetField)) {
              // Wait until all fields are scanned to confirm
            }
          }
        }
      }

      // Privacy Rationale Check (Baymard 37% drop-off prevention)
      const isSensitiveIntent =
        field.semanticIntent === 'identity-tax-id' ||
        field.semanticIntent === 'birth-date' ||
        field.semanticIntent === 'contact-phone' ||
        field.semanticIntent === 'payment-card-number' ||
        field.semanticIntent === 'payment-card-cvc';

      if ((field.sensitive || isSensitiveIntent) && !field.privacyRationale) {
        issues.push({
          code: 'MISSING_PRIVACY_RATIONALE',
          severity: 'warning',
          message: `Sensitive field "${field.name}" lacks a privacyRationale. Uncontextualized sensitive requests cause up to 37% form abandonment.`,
          targetId: field.id,
          targetType: 'field',
          heuristicSource: 'Baymard Institute Sensitive Field Heuristics',
          suggestion: 'Provide a privacyRationale explaining why this information is required.',
        });
      }

      // Semantic Intent & Autofill Check (WCAG 1.3.5)
      const isEmail = field.type === 'email' || field.name.toLowerCase().includes('email');
      const isPassword = field.type === 'password' || field.name.toLowerCase().includes('password');
      if (
        (isEmail || isPassword) &&
        !field.semanticIntent &&
        !field.autoComplete &&
        !field.textContentType
      ) {
        issues.push({
          code: 'MISSING_SEMANTIC_INTENT',
          severity: 'info',
          message: `Field "${field.name}" could benefit from explicit semanticIntent or autoComplete to leverage native OS autofill.`,
          targetId: field.id,
          targetType: 'field',
          heuristicSource: 'WCAG 2.1 Success Criterion 1.3.5: Identify Input Purpose',
        });
      }
    }
  }

  // 4. Verify Relational Dependencies & Targets
  for (const page of pages) {
    // Jump rules target validation
    if (page.jumpRules && Array.isArray(page.jumpRules)) {
      for (const jump of page.jumpRules) {
        if (!seenPageIds.has(jump.targetPageId)) {
          issues.push({
            code: 'INVALID_TARGET_PAGE',
            severity: 'error',
            message: `Page "${page.id}" jump rule points to non-existent targetPageId "${jump.targetPageId}".`,
            targetId: page.id,
            targetType: 'page',
          });
        }

        // Check jump rule condition fields
        const condFields = extractConditionFieldNames(jump.condition);
        for (const cf of condFields) {
          if (!allFieldNames.has(cf) && !allFieldIds.has(cf)) {
            issues.push({
              code: 'UNKNOWN_DEPENDENCY_FIELD',
              severity: 'error',
              message: `Jump rule on page "${page.id}" references non-existent condition field "${cf}".`,
              targetId: page.id,
              targetType: 'page',
            });
          }
        }
      }
    }

    if (page.defaultNextPageId && !seenPageIds.has(page.defaultNextPageId)) {
      issues.push({
        code: 'INVALID_TARGET_PAGE',
        severity: 'error',
        message: `Page "${page.id}" defaultNextPageId points to non-existent page "${page.defaultNextPageId}".`,
        targetId: page.id,
        targetType: 'page',
      });
    }

    // Field-level dependency verification
    for (const field of page.fields ?? []) {
      if (field.visibleIf) {
        const condFields = extractConditionFieldNames(field.visibleIf);
        for (const cf of condFields) {
          if (!allFieldNames.has(cf) && !allFieldIds.has(cf)) {
            issues.push({
              code: 'UNKNOWN_DEPENDENCY_FIELD',
              severity: 'error',
              message: `Field "${field.name}" visibleIf references non-existent field "${cf}".`,
              targetId: field.id,
              targetType: 'field',
            });
          }
        }
      }

      if (field.dependsOn && Array.isArray(field.dependsOn)) {
        for (const dep of field.dependsOn) {
          if (!allFieldNames.has(dep) && !allFieldIds.has(dep)) {
            issues.push({
              code: 'UNKNOWN_DEPENDENCY_FIELD',
              severity: 'error',
              message: `Field "${field.name}" dependsOn references non-existent field "${dep}".`,
              targetId: field.id,
              targetType: 'field',
            });
          }
        }
      }

      if (field.rules && Array.isArray(field.rules)) {
        for (const rule of field.rules) {
          if ('targetField' in rule && rule.targetField) {
            if (!allFieldNames.has(rule.targetField) && !allFieldIds.has(rule.targetField)) {
              issues.push({
                code: 'UNKNOWN_DEPENDENCY_FIELD',
                severity: 'error',
                message: `Field "${field.name}" rule references non-existent targetField "${rule.targetField}".`,
                targetId: field.id,
                targetType: 'field',
              });
            }
          }
        }
      }
    }
  }

  // 5. Reachability (Orphan Page Detection)
  const reachablePageIds = getReachablePageIds(graph);
  for (const page of pages) {
    if (page.id !== graph.rootPageId && !reachablePageIds.has(page.id)) {
      issues.push({
        code: 'ORPHAN_PAGE',
        severity: 'error',
        message: `Page "${page.id}" is unreachable from the root step. It has no incoming transitions or valid jump rules.`,
        targetId: page.id,
        targetType: 'page',
      });
    }
  }

  // 6. Page Cycle Detection
  const pageCycles = detectPageCycles(graph);
  for (const cycle of pageCycles) {
    issues.push({
      code: 'PAGE_CYCLE_DETECTED',
      severity: 'error',
      message: `Circular navigation cycle detected in wizard steps: ${cycle.join(' -> ')}`,
      targetId: cycle[0],
      targetType: 'page',
    });
  }

  // 7. Field Dependency Cycle Detection
  const fieldCycles = detectFieldCycles(graph);
  for (const cycle of fieldCycles) {
    issues.push({
      code: 'FIELD_CYCLE_DETECTED',
      severity: 'error',
      message: `Circular dependency detected between fields: ${cycle.join(' -> ')}`,
      targetId: cycle[0],
      targetType: 'field',
    });
  }

  // Partition issues by severity
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
    issues,
  };
}
