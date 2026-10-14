export type NavigationPolicy =
  | 'strict-linear'
  | 'random-access-open'
  | 'visited-only';

export type ProgressPresentation =
  | 'numbered-steps'
  | 'section-breadcrumbs'
  | 'weighted-velocity'
  | 'hybrid-stepper';

export type FeedbackAffordanceMode =
  | 'silent'
  | 'inline-validation'
  | 'reciprocal-insights'
  | 'tangible-unlock';

export type AffordancePreset =
  | 'enterprise-compliance'
  | 'frictionless-onboarding'
  | 'academic-survey'
  | 'custom';

export interface AddressAffordanceConfig {
  mode?: 'single-line-unpacker' | 'postal-first-cascade' | 'standard-grouped';
  overwritePolicy?: 'always' | 'empty-only' | 'preserve-user-edits';
  enableDeviceLocation?: boolean;
  enableContactPicker?: boolean;
  highlightAutofilledFields?: boolean;
  a11yAnnouncements?: boolean;
}

export interface FormAffordanceConfig {
  preset?: AffordancePreset;
  navigation?: NavigationPolicy;
  progress?: ProgressPresentation;
  feedback?: FeedbackAffordanceMode;
  allowSaveAndResumeLater?: boolean;
  showPreSubmissionSummary?: boolean;
  addressAffordance?: AddressAffordanceConfig;
}

export type StepStatus = 'completed' | 'current' | 'locked' | 'unvisited' | 'skipped';

export interface BreadcrumbItem {
  stepId: string;
  title: string;
  index: number;
  status: StepStatus;
  canNavigateTo: boolean;
  isSkipped?: boolean;
}

export interface ProgressMetrics {
  percentage: number;
  estimatedTimeRemainingText?: string;
  effortCompleted: number;
  effortTotal: number;
}

export interface PersistenceAffordanceState {
  isHydrated: boolean;
  hasSavedDraft: boolean;
  lastSavedAt?: string;
  pendingOutboxCount: number;
  isOnline: boolean;
  syncStatus: 'idle' | 'saving' | 'offline-queued' | 'syncing' | 'synced' | 'error';
  lastSyncError?: string;
}

export interface FormAffordanceState<TReward = unknown> {
  breadcrumbs: BreadcrumbItem[];
  progress: ProgressMetrics;
  activeReward: TReward | null;
  navigation: {
    canGoNext: boolean;
    canGoPrev: boolean;
    canSubmit: boolean;
    isFirstStep: boolean;
    isLastStep: boolean;
    isBranchingStep?: boolean;
    willDivertBranch?: boolean;
    hasDownstreamBranchData?: boolean;
    canSaveAndExit?: boolean;
  };
  persistence?: PersistenceAffordanceState;
  policy: {
    navigation: NavigationPolicy;
    progress: ProgressPresentation;
    feedback: FeedbackAffordanceMode;
    allowSaveAndResumeLater: boolean;
    showPreSubmissionSummary: boolean;
  };
}
