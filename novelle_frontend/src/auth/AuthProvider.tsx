import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import * as authApi from '@/api/auth';
import { isApiError } from '@/api/http';
import { queryKeys } from '@/api/queryKeys';
import type { Role, Me } from '@/types/user';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  user: Me | null;
  status: AuthStatus;
  hasRole: (...roles: Role[]) => boolean;
  /** Reload /api/me (after login, register, becoming an author, profile edits). */
  refresh: () => Promise<void>;
  /** Store the user returned by login/register without another round trip. */
  setUser: (user: Me | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** A 401 from /api/me means "guest", not an error. */
async function fetchMeOrGuest(): Promise<Me | null> {
  try {
    return await authApi.getMe();
  } catch (e) {
    if (isApiError(e) && e.status === 401) return null;
    throw e;
  }
}

/** Loads the current user from GET /api/me once at startup; exposes it through useAuth(). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMeOrGuest,
    staleTime: Infinity,
    retry: 1,
  });

  const user = meQuery.data ?? null;
  // A network error at startup leaves the visitor as a guest rather than blocking the whole app.
  const status: AuthStatus = meQuery.isPending ? 'loading' : user ? 'authenticated' : 'guest';

  const setUser = useCallback(
    (next: Me | null) => queryClient.setQueryData(queryKeys.me, next),
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Drop every cached personal query (library, studio, ...), then mark the user as a guest.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
      queryClient.setQueryData(queryKeys.me, null);
    }
  }, [queryClient]);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);

  const value = useMemo(
    () => ({ user, status, hasRole, refresh, setUser, logout }),
    [user, status, hasRole, refresh, setUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
