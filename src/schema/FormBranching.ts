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

/**
 * Classification of a page relative to the user's active branch path
 */
export type PeekBranchStatus =
  | 'current'
  | 'visited'
  | 'active-path'
  | 'conditional-branch'
  | 'unreachable';

/**
 * Prerequisite condition required to activate a conditional branch page
 */
export interface BranchPrerequisite {
  field: string;
  fieldLabel?: string;
  operator: ComparisonOperator;
  expectedValue?: unknown;
  currentValue?: unknown;
  satisfied: boolean;
}

/**
 * Detail of a field that will lose its value if the user switches away from the active branch
 */
export interface DiscardedFieldInfo {
  name: string;
  label: string;
  value: unknown;
  stepIndex: number;
  stepTitle: string;
}

/**
 * Complete impact analysis when peeking at or preparing to switch to a target page
 */
export interface BranchSwitchImpact {
  targetPageIndex: number;
  targetPageId: string;
  targetPageTitle: string;
  status: PeekBranchStatus;
  isConditional: boolean;
  isActivePath: boolean;
  divergentFromStepIndex: number | null;
  divergentFromStepTitle: string | null;
  prerequisites: BranchPrerequisite[];
  prunedStepIndices: number[];
  prunedFields: DiscardedFieldInfo[];
  hasDataLoss: boolean;
  spokenExplanation: string;
  canSwitch: boolean;
}

/**
 * Options configuring atomic branch switching
 */
export interface BranchSwitchOptions {
  autoSatisfyPrerequisites?: boolean;
  forcePrune?: boolean;
}

/**
 * Result of an atomic branch switch attempt
 */
export interface BranchSwitchResult {
  success: boolean;
  error?: string;
  rollbackApplied?: boolean;
  newActiveIndex: number;
}
