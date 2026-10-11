import type {
  FormAffordanceConfig,
  AffordancePreset,
  NavigationPolicy,
  ProgressPresentation,
  FeedbackAffordanceMode,
} from '../schema/FormAffordance.js';

export interface ResolvedAffordanceConfig {
  preset: AffordancePreset;
  navigation: NavigationPolicy;
  progress: ProgressPresentation;
  feedback: FeedbackAffordanceMode;
  allowSaveAndResumeLater: boolean;
  showPreSubmissionSummary: boolean;
}

export const AFFORDANCE_PRESET_DEFAULTS: Record<
  Exclude<AffordancePreset, 'custom'>,
  Omit<ResolvedAffordanceConfig, 'preset'>
> = {
  'enterprise-compliance': {
    navigation: 'visited-only',
    progress: 'section-breadcrumbs',
    feedback: 'inline-validation',
    allowSaveAndResumeLater: true,
    showPreSubmissionSummary: true,
  },
  'frictionless-onboarding': {
    navigation: 'strict-linear',
    progress: 'weighted-velocity',
    feedback: 'reciprocal-insights',
    allowSaveAndResumeLater: false,
    showPreSubmissionSummary: false,
  },
  'academic-survey': {
    navigation: 'strict-linear',
    progress: 'numbered-steps',
    feedback: 'silent',
    allowSaveAndResumeLater: true,
    showPreSubmissionSummary: false,
  },
};

/**
 * Resolves a partial FormAffordanceConfig into a fully populated configuration,
 * applying preset defaults and user overrides.
 */
export function resolveAffordanceConfig(
  config?: FormAffordanceConfig,
): ResolvedAffordanceConfig {
  const preset = config?.preset ?? 'frictionless-onboarding';

  if (preset !== 'custom' && AFFORDANCE_PRESET_DEFAULTS[preset]) {
    const base = AFFORDANCE_PRESET_DEFAULTS[preset];
    return {
      preset,
      navigation: config?.navigation ?? base.navigation,
      progress: config?.progress ?? base.progress,
      feedback: config?.feedback ?? base.feedback,
      allowSaveAndResumeLater:
        config?.allowSaveAndResumeLater ?? base.allowSaveAndResumeLater,
      showPreSubmissionSummary:
        config?.showPreSubmissionSummary ?? base.showPreSubmissionSummary,
    };
  }

  return {
    preset: 'custom',
    navigation: config?.navigation ?? 'strict-linear',
    progress: config?.progress ?? 'numbered-steps',
    feedback: config?.feedback ?? 'inline-validation',
    allowSaveAndResumeLater: config?.allowSaveAndResumeLater ?? false,
    showPreSubmissionSummary: config?.showPreSubmissionSummary ?? false,
  };
}
