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

  constructor(
    private readonly baseUrl: string = 'http://localhost:8000',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async init(): Promise<AuthUser | null> {
    try {
      const res = await this.fetchImpl(this.url('/api/v1/auth/me/'), {
        method: 'GET',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.authenticated && data.user) {
          this.currentUser = this.mapDjangoUser(data.user);
          this.notify();
          return this.currentUser;
        }
      }
    } catch {
      // Backend may be offline or unauthenticated
    }
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

  private mapDjangoUser(raw: Record<string, unknown>, overridePersona?: 'respondent' | 'creator'): AuthUser {
    const persona = (overridePersona || raw.persona || raw.role || 'respondent') as 'respondent' | 'creator';
    const isStaff = Boolean(raw.isStaff || raw.isSuperuser);
    const org = raw.organization as Record<string, string> | undefined;

    return {
      id: String(raw.id || `django-${Date.now()}`),
      email: String(raw.email || ''),
      username: String(raw.username || ''),
      role: persona,
      isStaff,
      displayName: String(raw.displayName || raw.username || raw.email || 'Researcher'),
      avatar: persona === 'creator' ? '🔬' : '🎙️',
      organizationId: org?.id,
      organizationName: org?.name || 'University of Moratuwa',
      organizationType: (org?.type as any) || 'university',
      userRoleInOrg: org?.userRole || (persona === 'creator' ? 'Principal Investigator' : 'Participant'),
      country: org?.country || 'Sri Lanka',
      totalPoints: Number(raw.totalPoints || 0),
      createdAt: String(raw.createdAt || new Date().toISOString()),
    };
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    const role = input.role || 'respondent';

    try {
      const res = await this.fetchImpl(this.url('/api/v1/auth/login/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: input.email.trim(),
          password: input.password || '',
          persona: role,
        }),
        credentials: 'include',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const errorMsg = data?.error || `Django login failed with HTTP ${res.status}`;
        throw new Error(errorMsg);
      }

      const user = this.mapDjangoUser(data.user, role);
      this.currentUser = user;
      this.notify();
      return user;
    } catch (err) {
      throw new Error(
        `Django login error: ${(err as Error).message}. Verify Django backend at ${this.baseUrl} is running.`,
      );
    }
  }

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    try {
      const res = await this.fetchImpl(this.url('/api/v1/auth/register/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email.trim(),
          password: input.password || 'password123',
          persona: 'respondent',
          displayName: input.displayName || input.email.split('@')[0],
          organizationId: input.organizationId,
          gender: input.gender,
          ageGroup: input.ageGroup,
          avatar: input.avatar,
        }),
        credentials: 'include',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Django registration failed with HTTP ${res.status}`;
        throw new Error(msg);
      }

      this.currentUser = this.mapDjangoUser(data.user, 'respondent');
      this.notify();
      return this.currentUser;
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    try {
      const res = await this.fetchImpl(this.url('/api/v1/auth/register/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email.trim(),
          password: input.password || 'password123',
          persona: 'creator',
          firstName: input.firstName,
          lastName: input.lastName,
          displayName: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
          organizationName: input.organizationName,
          organizationType: input.organizationType,
          userRoleInOrg: input.userRoleInOrg,
          country: input.country,
          bio: input.bio,
        }),
        credentials: 'include',
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Django creator registration failed with HTTP ${res.status}`;
        throw new Error(msg);
      }

      this.currentUser = this.mapDjangoUser(data.user, 'creator');
      this.notify();
      return this.currentUser;
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.fetchImpl(this.url('/api/v1/auth/logout/'), {
        method: 'POST',
        credentials: 'include',
      });
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
      content: `-- Django API sync state: ${this.baseUrl}\n-- Current user: ${this.currentUser?.username || this.currentUser?.email || 'none'}`,
    };
  }
}
