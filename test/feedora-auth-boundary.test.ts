import { describe, expect, it, vi } from 'vitest';
import type { IAuthPort, IUserDataExportPort } from '../apps/feedora-showcase/src/domain/ports/IAuthPort';
import type { AuthMode, AuthUser } from '../apps/feedora-showcase/src/domain/authTypes';
import { selectAuthPorts } from '../apps/feedora-showcase/src/authComposition';

const user: AuthUser = {
  id: 'django-7', email: 'person@example.org', role: 'respondent', displayName: 'Person',
  avatar: '🙂', totalPoints: 0,
};

function provider(id: AuthMode) {
  return {
    mode: id,
    init: vi.fn(async () => user),
    signUpRespondent: vi.fn(async () => user),
    signUpCreator: vi.fn(async () => user),
    signIn: vi.fn(async () => user),
    signOut: vi.fn(async () => undefined),
    getCurrentUser: vi.fn(() => user),
    onAuthStateChange: vi.fn(() => () => undefined),
    exportData: vi.fn(async () => ({ format: 'json' as const, timestamp: '', userCount: 0, responseCount: 0, content: id })),
  };
}

describe('Feedora identity boundary', () => {
  it('restores only the provider selected at composition time', async () => {
    const django = provider('django');
    const local = provider('local');
    const supabase = provider('supabase');
    const localFactory = vi.fn(() => local);
    const supabaseFactory = vi.fn(() => supabase);
    const ports = selectAuthPorts('django', { django: () => django, local: localFactory, supabase: supabaseFactory });

    await ports.identity.init();

    expect(django.init).toHaveBeenCalledOnce();
    expect(ports.identity).not.toHaveProperty('setMode');
    expect(ports.identity).not.toHaveProperty('mode');
    expect(local.init).not.toHaveBeenCalled();
    expect(supabase.init).not.toHaveBeenCalled();
    expect(localFactory).not.toHaveBeenCalled();
    expect(supabaseFactory).not.toHaveBeenCalled();
  });

  it('keeps export behind a separate port and routes it to the selected provider', async () => {
    const django = provider('django');
    const local = provider('local');
    const supabase = provider('supabase');
    const ports = selectAuthPorts('django', { django: () => django, local: () => local, supabase: () => supabase });

    expect(ports.identity).not.toHaveProperty('exportData');
    await ports.dataExport.exportData('json');
    expect(django.exportData).toHaveBeenCalledWith('json');
    expect(local.exportData).not.toHaveBeenCalled();
    expect(supabase.exportData).not.toHaveBeenCalled();
  });
});
