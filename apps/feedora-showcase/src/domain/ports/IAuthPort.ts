import type {
  AuthUser,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
} from '../authTypes';

/**
 * Port boundary for Authentication & Identity Management.
 *
 * Implemented by:
 *   1. LocalAuthAdapter    (In-memory / SQLite — instant zero-config)
 *   2. SupabaseAuthAdapter (Supabase Auth + Postgres — cloud sync)
 *   3. DjangoAuthAdapter   (Direct HTTP to Gihini's Django server)
 */
export interface IAuthPort {
  /** Initialize or restore existing session. */
  init(): Promise<AuthUser | null>;

  /** Register a new Form Respondent account. */
  signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser>;

  /** Register a new Form Creator / Researcher account. */
  signUpCreator(input: SignUpCreatorInput): Promise<AuthUser>;

  /** Sign in with email, password and optional role. */
  signIn(input: SignInInput): Promise<AuthUser>;

  /** Sign out the current user. */
  signOut(): Promise<void>;

  /** Return the currently authenticated user if any. */
  getCurrentUser(): AuthUser | null;

  /** Subscribe to authentication state transitions. */
  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void;
}

/** Export is a data lifecycle concern, not an identity operation. */
export interface IUserDataExportPort {
  exportData(format: 'json' | 'csv' | 'sql'): Promise<import('../authTypes').ExportDataPayload>;
}
