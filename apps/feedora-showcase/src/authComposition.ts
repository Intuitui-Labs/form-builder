import type { AuthMode } from './domain/authTypes';
import type { IAuthPort, IUserDataExportPort } from './domain/ports/IAuthPort';

export interface AuthPorts {
  identity: IAuthPort;
  dataExport: IUserDataExportPort;
}

export type AuthProviderSet = Record<AuthMode, () => IAuthPort & IUserDataExportPort>;

/** Select a single provider at the application boundary; never hydrate providers in parallel. */
export function selectAuthPorts(mode: AuthMode, providers: AuthProviderSet): AuthPorts {
  const selected = providers[mode]();
  return {
    identity: {
      init: () => selected.init(),
      signUpRespondent: (input) => selected.signUpRespondent(input),
      signUpCreator: (input) => selected.signUpCreator(input),
      signIn: (input) => selected.signIn(input),
      signOut: () => selected.signOut(),
      getCurrentUser: () => selected.getCurrentUser(),
      onAuthStateChange: (listener) => selected.onAuthStateChange(listener),
    },
    dataExport: { exportData: (format) => selected.exportData(format) },
  };
}
