/**
 * Remote survey shapes returned by Feedora's read-only JSON endpoint
 * (`GET /surveys/respond/<uuid>/meta/`). Mirrors the server's JsonResponse.
 */

export interface RemoteSurveyQuestion {
  id: number;
  code: string;
  text: string;
  type: string;
  construct: string;
  required: boolean;
  options: { id: number; text: string; order: number }[];
  ratingMax: number;
  ratingStyle: string;
  sectionTitle: string;
  sectionNum: number;
}

import type { SurveyFeatures } from '../types';
import type { PrincipalId, ScopeId, ScopeRef } from '../identity';

export interface RemoteSurveyMeta {
  csrfToken?: string;
  accessGrant?: string;
  survey: {
    id: number;
    uuid: string;
    scopeId?: ScopeId;
    scopeKind?: 'platform' | 'organization';
    scope?: ScopeRef;
    policyVersion?: string;
    policyConfirmationRequired?: boolean;
    attemptId?: string;
    attemptStorageKey?: string;
    title: string;
    description: string;
    is_hmsam: boolean;
    access_code?: string;
    accessPolicy?: import('@intuitui-labs/form-builder-engine').FormAccessPolicy;
    prerequisites?: string[];
    sequenceOrder?: number;
    sequenceGroup?: string;
    enforceSequence?: boolean;
    unlockDelayMs?: number;
    minScorePercent?: number;
    accessCodeRequired?: boolean;
    requiresAccount?: boolean;
  };
  features: Partial<SurveyFeatures> & Record<string, any>;
  experiment?: {
    experimentKey: string;
    variant: string;
  };
  questions: RemoteSurveyQuestion[];
}

export interface RemoteSurveyCatalogItem {
  id: number;
  uuid: string;
  accessCode?: string;
  title: string;
  description: string;
  isHmsam: boolean;
  isGlobal?: boolean;
  kind?: import('@intuitui-labs/form-builder-engine').FormKind;
  accessPolicy?: import('@intuitui-labs/form-builder-engine').FormAccessPolicy;
  prerequisites?: string[];
  prerequisiteTitles?: string[];
  sequenceOrder?: number;
  sequenceGroup?: string;
  enforceSequence?: boolean;
  unlockDelayMs?: number;
  minScorePercent?: number;
  accessCodeRequired?: boolean;
  eligibility?: {
    eligible: boolean;
    policyVersion: string;
    evaluatedAt: string;
    reasons: Array<{ code: string; [key: string]: unknown }>;
  };
  requiresAccount?: boolean;
  attemptsUsed?: number;
  lastCompletedAt?: string | null;
  questionsCount: number;
  createdAt?: string;
}

export interface RemoteSubmitResult {
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
  unlocksAt?: string;
  responseId?: number;
  submissionId?: string;
  principalId?: PrincipalId;
  scopeId?: ScopeId;
  scopeKind?: 'platform' | 'organization';
  scope?: ScopeRef;
  policyVersion?: string;
  attemptId?: string;
  acceptedAt?: string;
  replayed?: boolean;
  pointsEarned?: number;
  /** Total points in the returned survey's scope; does not combine scopes. */
  scopeTotalPoints?: number;
  /** Legacy account-wide total. Use platformPoints/scopePoints for scoped UX. */
  accountTotalPoints?: number;
  platformPoints?: number;
  variableBonus?: number;
  bonusLabel?: string;
  negativeReinforcement?: {
    enabled: boolean;
    friction_removed: boolean;
    streak_shielded: boolean;
    perk_description?: string;
  };
  totalPoints?: number;
  user?: any;
}

export interface RemoteLeaderboardResult {
  ok: boolean;
  scopeId?: string;
  scopeKind?: 'platform' | 'organization';
  totalContributors: number;
  contributors: Array<{
    userId: string;
    displayName: string;
    avatar: string;
    entityId: string;
    totalPoints: number;
    surveysCompleted: number;
    badges: string[];
    standing: {
      level: number;
      title: string;
      points: number;
      progress: number;
      next_title: string | null;
      points_needed: number;
      color: string;
    };
  }>;
}

export interface RemoteSurveyAnalysis {
  ok: boolean;
  survey: {
    id: number;
    uuid: string;
    title: string;
    isHmsam: boolean;
  };
  totalResponses: number;
  overallAdoption: number;
  overallAlpha: {
    value: number | null;
    interpretation: string;
  };
  constructScores: Record<
    string,
    {
      label: string;
      score: number;
      raw_percentage: number;
      normalized_score: number;
      mean: number;
      scale_min: number;
      scale_max: number;
      count: number;
      distribution: Record<string, number>;
      interpretation: string;
    }
  >;
  constructReliabilities: Record<
    string,
    {
      label: string;
      itemsCount: number;
      sampleSize: number;
      alpha: number;
      interpretation: string;
    }
  >;
  experimentalComparison: {
    arms: Record<
      string,
      {
        count: number;
        constructScores: Record<string, any>;
        overallScore: number;
        reliabilities: Record<string, any>;
      }
    >;
    constructDifferences: Record<string, number>;
    statisticalComparison?: Record<
      string,
      {
        tStatistic: number | null;
        degreesOfFreedom: number | null;
        pValue: number | null;
        hedgesG: number | null;
        effectSize: string;
        isSignificant: boolean;
        significanceMarker: string;
      }
    >;
  };
}

