import type {
  AuthMode,
  AuthUser,
  ExportDataPayload,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
} from '../domain/authTypes';
import type { IAuthPort } from '../domain/ports/IAuthPort';
import type { IEntityStore } from '../domain/ports/IEntityStore';
import { LocalAuthAdapter } from './LocalAuthAdapter';
import { SupabaseAuthAdapter, type SupabaseConfig } from './SupabaseAuthAdapter';
import { DjangoAuthAdapter } from './DjangoAuthAdapter';

export class CompositeAuthAdapter implements IAuthPort {
  private activeMode: AuthMode = 'local';
  private readonly store?: IEntityStore;
  private readonly localAdapter: LocalAuthAdapter;
  private readonly supabaseAdapter: SupabaseAuthAdapter;
  private readonly djangoAdapter: DjangoAuthAdapter;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  constructor(options?: {
    store?: IEntityStore;
    supabaseConfig?: SupabaseConfig;
    djangoBaseUrl?: string;
    initialMode?: AuthMode;
  }) {
    this.store = options?.store;
    this.localAdapter = new LocalAuthAdapter(options?.store);
    this.supabaseAdapter = new SupabaseAuthAdapter(options?.supabaseConfig);
    this.djangoAdapter = new DjangoAuthAdapter(options?.djangoBaseUrl || 'http://localhost:8000');

    if (options?.initialMode) {
      this.activeMode = options.initialMode;
    } else if (this.supabaseAdapter.isConfigured()) {
      this.activeMode = 'supabase';
    } else {
      this.activeMode = 'local';
    }

    // Subscribe to each adapter's events to bubble up when active
    this.localAdapter.onAuthStateChange((user) => {
      if (this.activeMode === 'local') this.notify(user);
    });
    this.supabaseAdapter.onAuthStateChange((user) => {
      if (this.activeMode === 'supabase') this.notify(user);
    });
    this.djangoAdapter.onAuthStateChange((user) => {
      if (this.activeMode === 'django') this.notify(user);
    });
  }

  get mode(): AuthMode {
    return this.activeMode;
  }

  get activeAdapter(): IAuthPort {
    switch (this.activeMode) {
      case 'supabase':
        return this.supabaseAdapter;
      case 'django':
        return this.djangoAdapter;
      case 'local':
      default:
        return this.localAdapter;
    }
  }

  getSupabaseAdapter(): SupabaseAuthAdapter {
    return this.supabaseAdapter;
  }

  getLocalAdapter(): LocalAuthAdapter {
    return this.localAdapter;
  }

  getDjangoAdapter(): DjangoAuthAdapter {
    return this.djangoAdapter;
  }

  setMode(mode: AuthMode): void {
    if (this.activeMode === mode) return;
    this.activeMode = mode;
    this.persistSession(this.getCurrentUser(), this.activeMode);
    this.notify(this.getCurrentUser());
  }

  async init(): Promise<AuthUser | null> {
    // 1. Immediately restore cached session from persistent store
    if (this.store) {
      try {
        const saved = await this.store.getItem('feedora_active_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.user) {
            this.activeMode = parsed.mode || this.activeMode;
            if (this.activeMode === 'django') {
              (this.djangoAdapter as any).currentUser = parsed.user;
            } else if (this.activeMode === 'local') {
              (this.localAdapter as any).currentUser = parsed.user;
            }
            this.notify(parsed.user);
          }
        }
      } catch {}
    }

    // 2. Background reconcile with backend
    try {
      await Promise.all([this.localAdapter.init(), this.supabaseAdapter.init(), this.djangoAdapter.init()]);
      const activeUser = this.getCurrentUser();
      if (activeUser) {
        await this.persistSession(activeUser, this.activeMode);
      }
    } catch {}

    return this.getCurrentUser();
  }

  getCurrentUser(): AuthUser | null {
    return this.activeAdapter.getCurrentUser();
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(user: AuthUser | null): void {
    for (const listener of this.listeners) {
      listener(user);
    }
  }

  private async persistSession(user: AuthUser | null, mode: AuthMode): Promise<void> {
    if (!this.store) return;
    try {
      if (user) {
        await this.store.setItem('feedora_active_session', JSON.stringify({ user, mode }));
      } else {
        await this.store.removeItem('feedora_active_session');
      }
    } catch {}
  }

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    const user = await this.activeAdapter.signUpRespondent(input);
    await this.persistSession(user, this.activeMode);
    return user;
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    const user = await this.activeAdapter.signUpCreator(input);
    await this.persistSession(user, this.activeMode);
    return user;
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    const user = await this.activeAdapter.signIn(input);
    await this.persistSession(user, this.activeMode);
    return user;
  }

  async signOut(): Promise<void> {
    await this.activeAdapter.signOut();
    await this.persistSession(null, this.activeMode);
    this.notify(null);
  }

  async exportData(format: 'json' | 'csv' | 'sql'): Promise<ExportDataPayload> {
    // If local or supabase, export rich state
    if (this.activeMode === 'local') {
      return this.localAdapter.exportData(format);
    }
    return this.activeAdapter.exportData(format);
  }
}
