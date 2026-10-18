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

export interface RemoteSurveyMeta {
  survey: {
    id: number;
    uuid: string;
    title: string;
    description: string;
    is_hmsam: boolean;
    access_code: string;
  };
  features: Partial<SurveyFeatures> & Record<string, any>;
  experiment?: {
    experimentKey: string;
    variant: string;
  };
  questions: RemoteSurveyQuestion[];
}

export interface RemoteSubmitResult {
  ok: boolean;
  status: number;
  responseId?: number;
  submissionId?: string;
  pointsEarned?: number;
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

