import seedJson from './feedora.seed.json';
import {
  type Entity,
  type EntityType,
  type SurveyFeatures,
} from '../domain/types';
import type { SeedBundle } from '../domain/ports/IEntityStore';

/**
 * Static research records are intentionally excluded from the client bundle.
 * Organization metadata and survey feature defaults are only startup fallbacks;
 * live organization, response, and standing data come from Django.
 */

interface SeedOrganization {
  id: number;
  org_name: string;
  org_type: string;
  user_role: string;
  country: string;
  user_id: number;
}

const organizations = seedJson.organizations as SeedOrganization[];

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

export const FEEDORA_PLATFORM_SCOPE: Entity = {
  id: 'platform',
  name: 'Feedora Platform',
  type: 'platform',
  scopeKind: 'platform',
  slug: 'feedora-platform',
  accent: '#14140f',
  tagline: 'Platform-wide research and standing',
  userRole: 'Platform community',
};

export const FEEDORA_ENTITIES: Entity[] = [...organizations.map(toEntity), FEEDORA_PLATFORM_SCOPE];
export const FEEDORA_ENTITY: Entity = FEEDORA_ENTITIES[0]!;

/** Survey.features of her latest HMSAM survey (survey id 24). */
export const FEEDORA_FEATURES = seedJson.featuresHmsam as unknown as SurveyFeatures;
/** Survey.features of her gamified sample survey (survey id 11). */
export const FEEDORA_FEATURES_GAMIFIED = seedJson.featuresGamified as unknown as SurveyFeatures;

export function buildSeed(): SeedBundle {
  return {
    entities: FEEDORA_ENTITIES,
    // Respondent identities, points, and response history are server sourced.
    profiles: [],
    responses: [],
  };
}
