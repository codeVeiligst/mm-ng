export type OidcClient = {
  isEnabled(): boolean;
  markLoginStarted(): void;
  consumeLoginStarted(): boolean;
  startLogin(): Promise<void>;
};

type OidcClientOptions = {
  enabled: boolean;
  loginPath: string;
};

class BackendOidcClient implements OidcClient {
  private readonly options: OidcClientOptions;
  private readonly storageKey = 'mm-ng-auth-method';

  constructor(options: OidcClientOptions) {
    this.options = options;
  }

  isEnabled() {
    return this.options.enabled;
  }

  markLoginStarted() {
    window.sessionStorage.setItem(this.storageKey, 'oidc');
  }

  consumeLoginStarted() {
    const value = window.sessionStorage.getItem(this.storageKey);
    window.sessionStorage.removeItem(this.storageKey);
    return value === 'oidc';
  }

  async startLogin() {
    this.markLoginStarted();
    window.location.assign(this.options.loginPath);
  }
}

export function createOidcClient(): OidcClient {
  return new BackendOidcClient({
    enabled: import.meta.env.VITE_MM_OIDC_ENABLED === 'true',
    loginPath: import.meta.env.VITE_MM_OIDC_LOGIN_PATH ?? '/auth/oidc/login',
  });
}
