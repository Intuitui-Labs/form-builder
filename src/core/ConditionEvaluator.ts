import type {
  ComparisonOperator,
  CompoundCondition,
  Condition,
  ConditionPredicate,
} from '../schema/FormBranching.js';

/**
 * Pure, zero-dependency condition evaluator for field visibility and dynamic page jumping.
 * Supports string/numeric coercion, array containment, emptiness checks, and nested AND/OR compound trees.
 */
export class ConditionEvaluator {
  /**
   * Evaluates a Condition (single predicate or compound condition) against a form values record.
   * If condition is undefined or null, returns true by default (always visible / unrestricted).
   */
  public static evaluate(
    condition: Condition | undefined | null,
    values: Record<string, unknown> = {},
  ): boolean {
    if (!condition) {
      return true;
    }

    if ('logical' in condition) {
      return this.evaluateCompound(condition, values);
    }

    return this.evaluatePredicate(condition, values);
  }

  /**
   * Evaluates recursive AND / OR compound conditions.
   */
  public static evaluateCompound(
    condition: CompoundCondition,
    values: Record<string, unknown>,
  ): boolean {
    if (!condition.predicates || condition.predicates.length === 0) {
      return true;
    }

    if (condition.logical === 'OR') {
      return condition.predicates.some((subCond) => this.evaluate(subCond, values));
    }

    // Default to AND
    return condition.predicates.every((subCond) => this.evaluate(subCond, values));
  }

  /**
   * Evaluates a single predicate against the given values.
   */
  public static evaluatePredicate(
    predicate: ConditionPredicate,
    values: Record<string, unknown>,
  ): boolean {
    const fieldValue = values[predicate.field];
    const targetValue = predicate.value;

    switch (predicate.operator) {
      case 'equals':
        return this.isEqual(fieldValue, targetValue);

      case 'notEquals':
        return !this.isEqual(fieldValue, targetValue);

      case 'contains':
        if (Array.isArray(fieldValue)) {
          return fieldValue.some((item) => this.isEqual(item, targetValue));
        }
        if (fieldValue !== null && fieldValue !== undefined && targetValue !== null && targetValue !== undefined) {
          return String(fieldValue).toLowerCase().includes(String(targetValue).toLowerCase());
        }
        return false;

      case 'greaterThan': {
        const numA = Number(fieldValue);
        const numB = Number(targetValue);
        if (isNaN(numA) || isNaN(numB)) return false;
        return numA > numB;
      }

      case 'lessThan': {
        const numA = Number(fieldValue);
        const numB = Number(targetValue);
        if (isNaN(numA) || isNaN(numB)) return false;
        return numA < numB;
      }

      case 'in':
        if (Array.isArray(targetValue)) {
          return targetValue.some((item) => this.isEqual(item, fieldValue));
        }
        if (typeof targetValue === 'string' && fieldValue !== null && fieldValue !== undefined) {
          return targetValue.toLowerCase().includes(String(fieldValue).toLowerCase());
        }
        return false;

      case 'notIn':
        if (Array.isArray(targetValue)) {
          return !targetValue.some((item) => this.isEqual(item, fieldValue));
        }
        if (typeof targetValue === 'string' && fieldValue !== null && fieldValue !== undefined) {
          return !targetValue.toLowerCase().includes(String(fieldValue).toLowerCase());
        }
        return true;

      case 'isEmpty':
        return this.isEmpty(fieldValue);

      case 'isNotEmpty':
        return !this.isEmpty(fieldValue);

      default:
        return false;
    }
  }

  /**
   * Checks equality with safe coercion between numbers, booleans, and strings.
   */
  public static isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }

    // Coerce numeric strings: '42' equals 42
    if (typeof a === 'number' && typeof b === 'string') {
      return String(a) === b;
    }
    if (typeof a === 'string' && typeof b === 'number') {
      return a === String(b);
    }

    // Coerce boolean strings: 'true' equals true
    if (typeof a === 'boolean' && typeof b === 'string') {
      return String(a) === b.toLowerCase();
    }
    if (typeof a === 'string' && typeof b === 'boolean') {
      return a.toLowerCase() === String(b);
    }

    return false;
  }

  /**
   * Determines if a value is considered empty:
   * null, undefined, empty/whitespace string, empty array, or empty object.
   */
  public static isEmpty(val: unknown): boolean {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.trim() === '';
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val).length === 0;
    return false;
  }
}

export const evaluateCondition = (
  condition: Condition | undefined | null,
  values: Record<string, unknown> = {},
): boolean => ConditionEvaluator.evaluate(condition, values);

export const evaluatePredicate = (
  predicate: ConditionPredicate,
  values: Record<string, unknown> = {},
): boolean => ConditionEvaluator.evaluatePredicate(predicate, values);

