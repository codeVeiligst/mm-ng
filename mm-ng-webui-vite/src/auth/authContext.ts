import { createContext } from 'react';
import type { CurrentUser } from '../types/minemeld';

export type AuthState = 'checking' | 'authenticated' | 'unauthenticated';
export type AuthAccess = 'read-only' | 'read-write';
export type AuthMethod = 'local' | 'oidc' | 'unknown';

export type AuthContextValue = {
  state: AuthState;
  user: CurrentUser | null;
  access: AuthAccess | null;
  method: AuthMethod;
  isAuthenticated: boolean;
  isReadWrite: boolean;
  canUseOidc: boolean;
  refreshUser: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  loginWithOidc: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
