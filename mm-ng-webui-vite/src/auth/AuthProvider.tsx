import { useCallback, useEffect, useMemo, useState } from 'react';
import { MineMeldApi } from '../api/minemeld';
import { ApiError } from '../api/http';
import type { CurrentUser } from '../types/minemeld';
import { AuthContext, type AuthAccess, type AuthContextValue, type AuthMethod, type AuthState } from './authContext';
import { createOidcClient } from './oidcClient';

const loginHintCookie = 'mm-ec-login';
const authMethodKey = 'mm-ng-auth-method';

function setLoginHint(enabled: boolean) {
  if (enabled) {
    document.cookie = `${loginHintCookie}=1; path=/; SameSite=Lax`;
    return;
  }

  document.cookie = `${loginHintCookie}=; Max-Age=0; path=/; SameSite=Lax`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [method, setMethod] = useState<AuthMethod>(() => {
    const stored = window.localStorage.getItem(authMethodKey);
    return stored === 'local' || stored === 'oidc' ? stored : 'unknown';
  });
  const oidcClient = useMemo(() => createOidcClient(), []);
  const [oidcEnabled, setOidcEnabled] = useState(() => oidcClient.isEnabled());

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await MineMeldApi.currentUser();
      const nextMethod =
        currentUser.auth_method === 'oidc' || currentUser.provider ? 'oidc' : oidcClient.consumeLoginStarted() ? 'oidc' : method;
      setLoginHint(true);
      window.localStorage.setItem(authMethodKey, nextMethod);
      setMethod(nextMethod);
      setUser(currentUser);
      setState('authenticated');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoginHint(false);
        window.localStorage.removeItem(authMethodKey);
        setUser(null);
        setMethod('unknown');
        setState('unauthenticated');
        return;
      }

      setUser(null);
      setMethod('unknown');
      setState('unauthenticated');
    }
  }, [method, oidcClient]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    MineMeldApi.oidcStatus()
      .then((status) => setOidcEnabled(status.enabled || oidcClient.isEnabled()))
      .catch(() => setOidcEnabled(oidcClient.isEnabled()));
  }, [oidcClient]);

  const login = useCallback(
    async (username: string, password: string) => {
      setState('checking');
      await MineMeldApi.login(username, password);
      window.localStorage.setItem(authMethodKey, 'local');
      setMethod('local');
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    await MineMeldApi.logout().catch(() => undefined);
    setLoginHint(false);
    window.localStorage.removeItem(authMethodKey);
    setUser(null);
    setMethod('unknown');
    setState('unauthenticated');
  }, []);

  const access = user ? (user.read_write ? 'read-write' : 'read-only') : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      access,
      method,
      isAuthenticated: state === 'authenticated',
      isReadWrite: access === 'read-write',
      canUseOidc: oidcEnabled,
      refreshUser,
      login,
      loginWithOidc: () => oidcClient.startLogin(),
      logout,
    }),
    [access, login, logout, method, oidcClient, oidcEnabled, refreshUser, state, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
