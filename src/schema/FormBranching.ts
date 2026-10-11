export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'in'
  | 'notIn'
  | 'isEmpty'
  | 'isNotEmpty';

export interface ConditionPredicate {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
}

export interface CompoundCondition {
  logical: 'AND' | 'OR';
  predicates: (ConditionPredicate | CompoundCondition)[];
}

export type Condition = ConditionPredicate | CompoundCondition;

/**
 * Field-level dynamic visibility configuration
 */
export interface FieldVisibilityRule {
  visibleIf: Condition;
  clearValueOnHide?: boolean; // Defaults to true to avoid stale hidden data
}

/**
 * Page-level dynamic jump rule for branching wizards
 */
export interface PageJumpRule {
  condition: Condition;
  targetPageId: string; // ID of the next page to transition to
}
