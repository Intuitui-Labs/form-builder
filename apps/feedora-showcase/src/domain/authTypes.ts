/**
 * Feedora Authentication & Account Domain Types.
 *
 * Aligned 1:1 with Gihini's Django research models:
 *   - accounts/models.py: User, Organization, CreatorProfile, RespondentProfile
 *   - surveys/models.py: Survey, Question, Response, Answer
 */

export type UserRole = 'respondent' | 'creator';

export type Gender = 'M' | 'F' | 'NB' | 'NS';

export type AgeGroup = 'under18' | '18-24' | '25-34' | '35-44' | '45+';

export type EntityType = 'university' | 'school' | 'company' | 'research' | 'other';

export type AuthMode = 'local' | 'supabase' | 'django';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  avatar: string;
  // Shared / Organization association
  organizationId?: string;
  organizationName?: string;
  organizationType?: EntityType;
  userRoleInOrg?: string;
  // Respondent specific
  gender?: Gender;
  ageGroup?: AgeGroup;
  totalPoints: number;
  surveysCompleted?: number;
  badges?: string[];
  // Creator specific
  firstName?: string;
  lastName?: string;
  company?: string;
  bio?: string;
  website?: string;
  country?: string;
  createdAt?: string;
}

export interface SignUpRespondentInput {
  email: string;
  password?: string;
  displayName: string;
  organizationId: string;
  gender?: Gender;
  ageGroup?: AgeGroup;
  avatar?: string;
}

export interface SignUpCreatorInput {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  organizationName: string;
  organizationType: EntityType;
  userRoleInOrg?: string;
  country?: string;
  website?: string;
  bio?: string;
  avatar?: string;
}

export interface SignInInput {
  email: string;
  password?: string;
  role?: UserRole;
}

export interface AuthState {
  user: AuthUser | null;
  mode: AuthMode;
  isLoading: boolean;
  error: string | null;
}

export interface ExportDataPayload {
  format: 'json' | 'csv' | 'sql';
  timestamp: string;
  userCount: number;
  responseCount: number;
  content: string;
}
