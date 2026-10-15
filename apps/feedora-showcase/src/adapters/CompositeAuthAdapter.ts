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
    this.notify(this.getCurrentUser());
  }

  async init(): Promise<AuthUser | null> {
    await Promise.all([this.localAdapter.init(), this.supabaseAdapter.init(), this.djangoAdapter.init()]);
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

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    return this.activeAdapter.signUpRespondent(input);
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    return this.activeAdapter.signUpCreator(input);
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    return this.activeAdapter.signIn(input);
  }

  async signOut(): Promise<void> {
    await this.activeAdapter.signOut();
  }

  async exportData(format: 'json' | 'csv' | 'sql'): Promise<ExportDataPayload> {
    // If local or supabase, export rich state
    if (this.activeMode === 'local') {
      return this.localAdapter.exportData(format);
    }
    return this.activeAdapter.exportData(format);
  }
}
