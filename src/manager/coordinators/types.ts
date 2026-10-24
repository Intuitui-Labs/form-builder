import type { FormField, FormPage, FormSchema } from '../../schema/FormSchema.js';
import type { FormAffordanceState, ProgressMetrics } from '../../schema/FormAffordance.js';
import type { FormDraftSnapshot } from '../../schema/FormDraft.js';
import type {
  AttachmentPointer,
  IAttachmentStoragePort,
  IFormLifecyclePort,
  IHapticFeedbackPort,
  ISanitizerPort,
  ISpeechSynthesisPort,
  ITelemetryPort,
  RewardPayload,
} from '../../ports/index.js';
import type { ResolvedAffordanceConfig } from '../../adapters/index.js';
import type { NativeFocusController } from '../../focus/NativeFocusController.js';
import type { FormManager } from '../FormManager.js';
import type { OfflineOutboxQueue, OutboxSyncStatus } from '../../persistence/OfflineOutboxQueue.js';
import type { IAssessmentPort } from '../../ports/IAssessmentPort.js';

import type { FormParticipationConfig } from '../../schema/FormParticipation.js';

/**
 * Shared context and interface bindings provided to each coordinator by MultiStepFormManager.
 * Coordinators remain pure delegates that do not store duplicate state.
 */
export interface MultiStepCoordinatorContext<T extends Record<string, unknown>> {
  schema: FormSchema;
  formManager: FormManager<T>;
  lifecyclePort: IFormLifecyclePort<T>;
  policy: ResolvedAffordanceConfig;
  focusController: NativeFocusController;
  sanitizer: ISanitizerPort;
  telemetry?: ITelemetryPort;
  hapticPort?: IHapticFeedbackPort;
  speechSynthesisPort?: ISpeechSynthesisPort;
  attachmentStorage?: IAttachmentStoragePort;
  onAttachmentPruned?: (field: string, pointer: AttachmentPointer) => void;
  autoSaveDraft: boolean;
  sessionId: string;
  formStartTime: number;
  getStepStartTime: () => number;
  setStepStartTime: (time: number) => void;
  notify: () => void;
  saveDraft: () => FormDraftSnapshot<T>;
  scheduleAutoSaveDraft: () => void;
  isHydrated: () => boolean;
  getVisibleFields: (pageIndex?: number) => FormField[];
  pruneHiddenFieldValues: () => void;
  getCurrentPageIndex: () => number;
  getCurrentPage: () => FormPage;
  getInspectedPageIndex: () => number;
  setInspectedPageIndex: (index: number | null) => void;
  getProjectedPath: () => number[];
  canNavigateToStep: (targetIndex: number) => boolean;
  getNextPageIndex: () => number | null;
  getStepHistory: () => number[];
  isFirstStep: () => boolean;
  isLastStep: () => boolean;
  isBranchingStep: (pageIndex?: number) => boolean;
  willDivertBranch: (pageIndex?: number) => boolean;
  hasDownstreamBranchData: (pageIndex?: number) => boolean;
  validateCurrentStep: () => boolean;
  getProgress: () => ProgressMetrics;
  triggerRewardEvaluation: (completedIndex: number, completedPage: FormPage) => void;
  hasSavedDraftState: boolean;
  setHasSavedDraftState: (state: boolean) => void;
  getOutboxQueue: () => OfflineOutboxQueue<T> | undefined;
  getOutboxSyncStatus: () => OutboxSyncStatus;
  getOutboxLastSyncError: () => string | undefined;
  getAssessmentEngine?: () => IAssessmentPort | undefined;
  getParticipationConfig?: () => FormParticipationConfig | undefined;
  onDraftHydrated?: (snapshot: FormDraftSnapshot<T>) => void;
}
