import seedJson from './feedora.seed.json';
import {
  FEEDORA_BADGES,
  type ContributionProfile,
  type Entity,
  type EntityType,
  type SurveyFeatures,
} from '../domain/types';
import { standingFor } from '../domain/levels';
import type { SeedBundle } from '../domain/ports/IEntityStore';

/**
 * Real data extracted from her Django app (`gihini-research/db.sqlite3`) by
 * `gen_seed.py`: 1 organisation (University of Moratuwa), 3 registered
 * respondents, 44 responses, and 190 HMSAM answers across 5 responses.
 * Regenerate with that script whenever her DB changes.
 */

interface SeedOrganization {
  id: number;
  org_name: string;
  org_type: string;
  user_role: string;
  country: string;
  user_id: number;
}

interface SeedRespondent {
  user_id: number;
  email: string;
  display_name: string;
  total_points: number;
}

interface SeedResponseRow {
  id: number;
  survey_id: number;
  user_id: number | null;
  points_earned: number;
  completed_at: string;
}

interface SeedAnswerRow {
  response_id: number;
  survey_id: number;
  question_code: string;
  hmsam_construct: string;
  likert_value: number;
}

const organizations = seedJson.organizations as SeedOrganization[];
const respondents = seedJson.respondents as SeedRespondent[];
const responseRows = seedJson.responses as SeedResponseRow[];
const answerRows = seedJson.hmsamAnswers as SeedAnswerRow[];

function accentFor(type: EntityType): string {
  switch (type) {
    case 'university':
      return '#7A4FA8';
    case 'school':
      return '#1F4D8F';
    case 'company':
      return '#0E9F6E';
    case 'research':
      return '#B45309';
    default:
      return '#6C6784';
  }
}

function taglineFor(type: EntityType): string {
  switch (type) {
    case 'university':
      return 'Campus research & student voice';
    case 'school':
      return 'Learner feedback programme';
    case 'company':
      return 'Employee & user research';
    case 'research':
      return 'Survey research institute';
    default:
      return 'Research community';
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toEntity(org: SeedOrganization): Entity {
  const type = org.org_type as EntityType;
  return {
    id: `org-${org.id}`,
    name: org.org_name,
    type,
    slug: slugify(org.org_name),
    accent: accentFor(type),
    tagline: taglineFor(type),
    userRole: org.user_role || undefined,
    country: org.country || undefined,
  };
}

export const FEEDORA_ENTITIES: Entity[] = organizations.map(toEntity);
export const FEEDORA_ENTITY: Entity = FEEDORA_ENTITIES[0]!;

/** Survey.features of her latest HMSAM survey (survey id 24). */
export const FEEDORA_FEATURES = seedJson.featuresHmsam as unknown as SurveyFeatures;
/** Survey.features of her gamified sample survey (survey id 11). */
export const FEEDORA_FEATURES_GAMIFIED = seedJson.featuresGamified as unknown as SurveyFeatures;

const AVATARS = ['🎙️', '📣', '💬', '🗣️', '🎧', '🌱'];

/** One HMSAM response matrix row per real response_id (field code -> likert 1-5). */
export const SEED_HMSAM_MATRIX: Record<string, number>[] = (() => {
  const byResponse = new Map<number, Record<string, number>>();
  for (const row of answerRows) {
    const bucket = byResponse.get(row.response_id) ?? {};
    bucket[row.question_code] = row.likert_value;
    byResponse.set(row.response_id, bucket);
  }
  return [...byResponse.values()];
})();

function responseCountFor(userId: number): number {
  return responseRows.filter((r) => r.user_id === userId).length;
}

export function buildSeed(): SeedBundle {
  const entityId = FEEDORA_ENTITY.id;

  const profiles: ContributionProfile[] = respondents.map((respondent, index) => {
    const surveysCompleted = responseCountFor(respondent.user_id);
    const badges = FEEDORA_BADGES.filter((b) => surveysCompleted >= b.minResponses).map((b) => b.id);
    return {
      userId: `user-${respondent.user_id}`,
      displayName: respondent.display_name,
      avatar: AVATARS[index % AVATARS.length]!,
      entityId,
      totalPoints: respondent.total_points,
      surveysCompleted,
      badges,
      standing: standingFor(respondent.total_points),
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    entities: FEEDORA_ENTITIES,
    profiles,
    responses: SEED_HMSAM_MATRIX,
  };
}
