import type {
  AuthMode,
  AuthUser,
  ExportDataPayload,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
} from '../domain/authTypes';
import type { IAuthPort } from '../domain/ports/IAuthPort';

export class DjangoAuthAdapter implements IAuthPort {
  readonly mode: AuthMode = 'django';
  private currentUser: AuthUser | null = null;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();
  private csrfToken: string | null = null;

  constructor(
    private readonly baseUrl: string = 'http://localhost:8000',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async init(): Promise<AuthUser | null> {
    return this.currentUser;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    const body = new URLSearchParams();
    body.append('email', input.email.trim());
    body.append('password', input.password || 'password123');
    body.append('repeat_password', input.password || 'password123');

    try {
      const res = await this.fetchImpl(this.url('/accounts/register/respondent/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      });

      if (!res.ok && res.status !== 302) {
        throw new Error(`Django respondent registration failed with HTTP ${res.status}`);
      }

      const user: AuthUser = {
        id: `django-${Date.now()}`,
        email: input.email.trim(),
        role: 'respondent',
        displayName: input.displayName || input.email.split('@')[0] || 'Respondent',
        avatar: input.avatar || '🎙️',
        organizationId: input.organizationId,
        gender: input.gender,
        ageGroup: input.ageGroup,
        totalPoints: 0,
        createdAt: new Date().toISOString(),
      };

      this.currentUser = user;
      this.notify();
      return user;
    } catch (err) {
      throw new Error(
        `Unable to reach Django backend at ${this.baseUrl}: ${(err as Error).message}. Ensure 'python manage.py runserver' is active, or use Local/Supabase mode.`,
      );
    }
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    const body = new URLSearchParams();
    body.append('email', input.email.trim());
    body.append('password', input.password || 'password123');
    body.append('repeat_password', input.password || 'password123');
    body.append('first_name', input.firstName);
    body.append('last_name', input.lastName);
    body.append('terms', 'on');

    try {
      const res = await this.fetchImpl(this.url('/accounts/register/creator/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      });

      if (!res.ok && res.status !== 302) {
        throw new Error(`Django creator registration failed with HTTP ${res.status}`);
      }

      const user: AuthUser = {
        id: `django-creator-${Date.now()}`,
        email: input.email.trim(),
        role: 'creator',
        displayName: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
        firstName: input.firstName,
        lastName: input.lastName,
        organizationName: input.organizationName,
        organizationType: input.organizationType,
        userRoleInOrg: input.userRoleInOrg || 'Creator',
        country: input.country || 'Sri Lanka',
        website: input.website || '',
        bio: input.bio || '',
        avatar: input.avatar || '🔬',
        totalPoints: 0,
        createdAt: new Date().toISOString(),
      };

      this.currentUser = user;
      this.notify();
      return user;
    } catch (err) {
      throw new Error(
        `Unable to reach Django backend at ${this.baseUrl}: ${(err as Error).message}. Ensure 'python manage.py runserver' is active, or use Local/Supabase mode.`,
      );
    }
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    const role = input.role || 'respondent';
    const targetUrl = this.url(role === 'creator' ? '/accounts/login/creator/' : '/accounts/login/respondent/');

    const body = new URLSearchParams();
    body.append('email', input.email.trim());
    body.append('password', input.password || '');

    try {
      const res = await this.fetchImpl(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'include',
      });

      if (!res.ok && res.status !== 302) {
        throw new Error(`Invalid credentials on Django backend (${res.status})`);
      }

      const user: AuthUser = {
        id: `django-${Date.now()}`,
        email: input.email.trim(),
        role,
        displayName: input.email.split('@')[0] || (role === 'creator' ? 'Creator' : 'Respondent'),
        avatar: role === 'creator' ? '🔬' : '🎙️',
        totalPoints: 0,
        createdAt: new Date().toISOString(),
      };

      this.currentUser = user;
      this.notify();
      return user;
    } catch (err) {
      throw new Error(
        `Django login error: ${(err as Error).message}. Ensure Django server is running on ${this.baseUrl}.`,
      );
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.fetchImpl(this.url('/accounts/logout/'), { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore network errors on logout
    }
    this.currentUser = null;
    this.notify();
  }

  async exportData(format: 'json' | 'csv' | 'sql'): Promise<ExportDataPayload> {
    return {
      format,
      timestamp: new Date().toISOString(),
      userCount: this.currentUser ? 1 : 0,
      responseCount: 0,
      content: `-- Django API sync state: ${this.baseUrl}`,
    };
  }
}
