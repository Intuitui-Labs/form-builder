/**
 * Feedora domain types — mirrored from her Django app, not invented.
 *
 *   accounts/models.py   → Organization.ORG_TYPES (EntityType)
 *   accounts/utils.py    → LEVELS + get_level_info() level curve (Standing)
 *   surveys/models.py    → Survey.features JSON shape (SurveyFeatures)
 *   templates/.../add_features.html → the real badge set (Bronze/Silver/Gold)
 */

export type EntityType = 'university' | 'school' | 'company' | 'research' | 'other';

/** Her `Organization` — a creator's organisation that hosts surveys. */
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  slug: string;
  accent: string;
  tagline: string;
  /** Her Organization.user_role, e.g. "Student". */
  userRole?: string;
  country?: string;
}

// ── Level curve (accounts/utils.py LEVELS) ────────────────────────────────

export interface LevelDefinition {
  /** 1-indexed, matches her LEVELS tuple `level_num`. */
  level: number;
  title: string;
  minPoints: number;
  /** Inclusive upper bound; null for the top level. */
  maxPoints: number | null;
}

export const FEEDORA_LEVELS: LevelDefinition[] = [
  { level: 1, title: 'New Voice', minPoints: 0, maxPoints: 99 },
  { level: 2, title: 'Contributor', minPoints: 100, maxPoints: 399 },
  { level: 3, title: 'Active Member', minPoints: 400, maxPoints: 699 },
  { level: 4, title: 'Trusted Respondent', minPoints: 700, maxPoints: 999 },
  { level: 5, title: 'Community Champion', minPoints: 1000, maxPoints: null },
];

/**
 * Her get_level_info() return value, verbatim keys included.
 * progress = int(((points - min) / (max - min + 1)) * 100), clamped 0-100.
 */
export interface Standing {
  level: number;
  title: string;
  points: number;
  progress: number;
  next_title: string | null;
  points_needed: number;
  /** UI-only: level colour from the palette. */
  color: string;
}

// ── Survey.features (surveys/models.py `features` JSONField) ──────────────

export interface MascotFeature {
  enabled: boolean;
  name: string;
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

export interface ProgressFeature {
  enabled: boolean;
  style: 'solid' | 'striped';
  color: string;
  label: 'percent' | 'count';
}

export interface PointsFeature {
  enabled: boolean;
  values: Record<string, number>;
}

export interface BadgesFeature {
  enabled: boolean;
}

export interface VoucherFeature {
  enabled: boolean;
  code: string;
  discount: string;
}

export interface CollectionFeature {
  email: boolean;
  savecopy: boolean;
  emailcopy: boolean;
  limit: boolean;
  accept: boolean;
}

export interface DashboardFeature {
  enabled: boolean;
  alpha: boolean;
  hmsam: boolean;
  responses: boolean;
  leaderboard: boolean;
  byquestion: boolean;
  individual: boolean;
}

export interface SurveyFeatures {
  mascot: MascotFeature;
  progress: ProgressFeature;
  points: PointsFeature;
  badges: BadgesFeature;
  voucher: VoucherFeature;
  collection: CollectionFeature;
  dashboard: DashboardFeature;
}

/** Her per-question-type default points (surveys/views.py DEFAULT_POINTS). */
export const DEFAULT_POINTS: Record<string, number> = {
  likert: 10,
  rating: 10,
  mcq: 10,
  checkbox: 10,
  dropdown: 10,
  short: 10,
  open: 20,
  date: 5,
  file: 15,
};

// ── Badges (templates/.../add_features.html) ──────────────────────────────

export interface BadgeDefinition {
  id: string;
  label: string;
  icon: string;
  /** Her rule is response-count based. */
  minResponses: number;
  rule: string;
}

export const FEEDORA_BADGES: BadgeDefinition[] = [
  { id: 'bronze', label: 'Bronze', icon: '🥉', minResponses: 1, rule: 'First-time respondent' },
  { id: 'silver', label: 'Silver', icon: '🥈', minResponses: 5, rule: '5 responses total' },
  { id: 'gold', label: 'Gold', icon: '🥇', minResponses: 6, rule: 'More than 5 responses' },
];

// ── Contribution profile (accounts/models.py RespondentProfile) ────────────

/** A persistent contributor, scoped to the entity whose surveys they respond to. */
export interface ContributionProfile {
  userId: string;
  displayName: string;
  avatar: string;
  entityId: string;
  totalPoints: number;
  surveysCompleted: number;
  badges: string[];
  standing: Standing;
  updatedAt: string;
}
