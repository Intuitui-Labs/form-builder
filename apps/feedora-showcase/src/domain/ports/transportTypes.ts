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
}
