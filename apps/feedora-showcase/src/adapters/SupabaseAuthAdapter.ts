import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthMode,
  AuthUser,
  ExportDataPayload,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
} from '../domain/authTypes';
import type { IAuthPort } from '../domain/ports/IAuthPort';

export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
}

export class SupabaseAuthAdapter implements IAuthPort {
  readonly mode: AuthMode = 'supabase';
  private client: SupabaseClient | null = null;
  private currentUser: AuthUser | null = null;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();
  private configured = false;

  constructor(config?: SupabaseConfig) {
    const url = config?.url || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const key = config?.anonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    if (url && key) {
      try {
        this.client = createClient(url, key);
        this.configured = true;
      } catch (err) {
        console.warn('[SupabaseAuthAdapter] Failed to initialize client:', err);
      }
    }
  }

  isConfigured(): boolean {
    return this.configured && this.client !== null;
  }

  configure(url: string, anonKey: string): void {
    try {
      this.client = createClient(url, anonKey);
      this.configured = true;
      this.init();
    } catch (err) {
      throw new Error(`Failed to configure Supabase: ${(err as Error).message}`);
    }
  }

  async init(): Promise<AuthUser | null> {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client.auth.getSession();
      if (error || !data.session?.user) {
        this.currentUser = null;
        return null;
      }

      const sbUser = data.session.user;
      this.currentUser = this.mapSupabaseUserToAuthUser(sbUser);
      this.notify();
      return this.currentUser;
    } catch {
      return null;
    }
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

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured yet. Please provide your Supabase URL & Anon Key, or switch to Local mode.',
      );
    }

    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password || 'TemporaryPassword123!',
      options: {
        data: {
          role: 'respondent',
          displayName: input.displayName,
          organizationId: input.organizationId,
          gender: input.gender || 'NS',
          ageGroup: input.ageGroup || '18-24',
          avatar: input.avatar || '🎯',
          totalPoints: 0,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Sign up completed, but user object was not returned. Check email confirmation settings.');
    }

    const authUser = this.mapSupabaseUserToAuthUser(data.user, {
      role: 'respondent',
      displayName: input.displayName,
      organizationId: input.organizationId,
      gender: input.gender,
      ageGroup: input.ageGroup,
      avatar: input.avatar,
      totalPoints: 0,
    });

    // Optionally create row in respondent_profiles table if table exists
    try {
      await this.client.from('respondent_profiles').upsert({
        user_id: data.user.id,
        display_name: input.displayName,
        gender: input.gender || 'NS',
        age_group: input.ageGroup || '18-24',
        avatar: input.avatar || '🎯',
        total_points: 0,
      });
    } catch {
      // Table may not be migrated yet; metadata in auth.users suffices
    }

    this.currentUser = authUser;
    this.notify();
    return authUser;
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured yet. Please provide your Supabase URL & Anon Key, or switch to Local mode.',
      );
    }

    const { data, error } = await this.client.auth.signUp({
      email: input.email.trim(),
      password: input.password || 'TemporaryPassword123!',
      options: {
        data: {
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
          avatar: input.avatar || '🏛️',
          totalPoints: 0,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('Sign up completed, but user object was not returned.');
    }

    const authUser = this.mapSupabaseUserToAuthUser(data.user, {
      role: 'creator',
      displayName: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
      firstName: input.firstName,
      lastName: input.lastName,
      organizationName: input.organizationName,
      organizationType: input.organizationType,
      userRoleInOrg: input.userRoleInOrg,
      country: input.country,
      website: input.website,
      bio: input.bio,
      avatar: input.avatar,
      totalPoints: 0,
    });

    // Optionally write to organizations and creator_profiles
    try {
      await this.client.from('organizations').upsert({
        user_id: data.user.id,
        org_name: input.organizationName,
        org_type: input.organizationType,
        user_role: input.userRoleInOrg || 'Creator',
        country: input.country || 'Sri Lanka',
      });
    } catch {
      // Table not yet created
    }

    this.currentUser = authUser;
    this.notify();
    return authUser;
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured yet. Please provide your Supabase URL & Anon Key, or switch to Local mode.',
      );
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password || '',
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('No user returned after sign in.');
    }

    const authUser = this.mapSupabaseUserToAuthUser(data.user);
    if (input.role && authUser.role !== input.role) {
      throw new Error(`This Supabase account is registered as ${authUser.role}, not ${input.role}.`);
    }

    this.currentUser = authUser;
    this.notify();
    return authUser;
  }

  async signOut(): Promise<void> {
    if (this.client) {
      await this.client.auth.signOut();
    }
    this.currentUser = null;
    this.notify();
  }

  async exportData(format: 'json' | 'csv' | 'sql'): Promise<ExportDataPayload> {
    const user = this.currentUser ? [this.currentUser] : [];
    if (format === 'json') {
      return {
        format: 'json',
        timestamp: new Date().toISOString(),
        userCount: user.length,
        responseCount: 0,
        content: JSON.stringify({ source: 'Supabase Feedora Cloud', users: user }, null, 2),
      };
    }
    return {
      format,
      timestamp: new Date().toISOString(),
      userCount: user.length,
      responseCount: 0,
      content: `-- Supabase Export\n-- Generated: ${new Date().toISOString()}`,
    };
  }

  private mapSupabaseUserToAuthUser(sbUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }, fallback?: Partial<AuthUser>): AuthUser {
    const meta = sbUser.user_metadata || {};
    return {
      id: sbUser.id,
      email: sbUser.email || (fallback?.email ?? ''),
      role: (meta.role as 'respondent' | 'creator') || fallback?.role || 'respondent',
      displayName: (meta.displayName as string) || fallback?.displayName || sbUser.email?.split('@')[0] || 'User',
      avatar: (meta.avatar as string) || fallback?.avatar || '🌟',
      organizationId: (meta.organizationId as string) || fallback?.organizationId,
      organizationName: (meta.organizationName as string) || fallback?.organizationName,
      organizationType: (meta.organizationType as any) || fallback?.organizationType,
      userRoleInOrg: (meta.userRoleInOrg as string) || fallback?.userRoleInOrg,
      gender: (meta.gender as any) || fallback?.gender,
      ageGroup: (meta.ageGroup as any) || fallback?.ageGroup,
      totalPoints: Number(meta.totalPoints ?? fallback?.totalPoints ?? 0),
      firstName: (meta.firstName as string) || fallback?.firstName,
      lastName: (meta.lastName as string) || fallback?.lastName,
      bio: (meta.bio as string) || fallback?.bio,
      website: (meta.website as string) || fallback?.website,
      country: (meta.country as string) || fallback?.country,
      createdAt: new Date().toISOString(),
    };
  }
}
