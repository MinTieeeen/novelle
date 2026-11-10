import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import * as authApi from '@/api/auth';
import { useAuth } from '@/auth/AuthProvider';
import { AuthModal, type AuthTab } from '@/components/auth/AuthModal';
import type { LoginValues, Me, RegisterValues } from '@/types/user';
import { bannedDescription, errorMessage, hasCode, rateLimitedMessage } from '@/utils/errors';

export interface OpenAuthOptions {
  /** After a successful login/register (default: stay on the current page). */
  onSuccess?: (me: Me) => void;
  /** When the user closes the popup without logging in. */
  onDismiss?: () => void;
}

interface AuthModalContextValue {
  open: (tab: AuthTab, options?: OpenAuthOptions) => void;
  close: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

/** Field-level codes are shown by the forms; everything else becomes a toast here. */
export function toastAuthError(error: unknown, fieldCodes: string[]) {
  if (hasCode(error, ...fieldCodes, 'VALIDATION_FAILED')) return;
  if (hasCode(error, 'ACCOUNT_BANNED')) {
    toast.error('Tài khoản đã bị khoá', { id: 'account-banned', description: bannedDescription(error) });
  } else if (hasCode(error, 'RATE_LIMITED')) {
    toast.warning(rateLimitedMessage(error), { id: 'rate-limited' });
  } else {
    toast.error(errorMessage(error), { id: 'auth-error' });
  }
}

/**
 * One login/register popup for the whole app (AuthModal board). `useAuthModal().open('login')` opens it
 * over the current page; /login and /register open it over the home page with their own callbacks.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { setUser } = useAuth();
  const [state, setState] = useState<{ open: boolean; tab: AuthTab }>({ open: false, tab: 'login' });
  const options = useRef<OpenAuthOptions>({});

  const open = useCallback((tab: AuthTab, opts: OpenAuthOptions = {}) => {
    options.current = opts;
    setState({ open: true, tab });
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const finish = useCallback(
    (me: Me) => {
      setUser(me);
      setState((s) => ({ ...s, open: false }));
      options.current.onSuccess?.(me);
      options.current = {};
    },
    [setUser],
  );

  const onLogin = useCallback(
    async (values: LoginValues) => {
      try {
        const me = await authApi.login({ login: values.login.trim(), password: values.password });
        finish(me);
        toast.success(`Đã đăng nhập. Chào ${me.displayName} quay lại.`);
      } catch (e) {
        toastAuthError(e, ['INVALID_CREDENTIALS']);
        throw e;
      }
    },
    [finish],
  );

  const onRegister = useCallback(
    async ({ confirmPassword: _confirm, ...body }: RegisterValues) => {
      try {
        const me = await authApi.register(body);
        finish(me);
        toast.success(`Đã tạo tài khoản. Chào mừng ${me.displayName} đến Novelle.`);
      } catch (e) {
        toastAuthError(e, ['USERNAME_TAKEN', 'EMAIL_TAKEN']);
        throw e;
      }
    },
    [finish],
  );

  const onOpenChange = useCallback((next: boolean) => {
    if (next) return;
    setState((s) => ({ ...s, open: false }));
    options.current.onDismiss?.();
    options.current = {};
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal
        open={state.open}
        tab={state.tab}
        onTabChange={(tab) => setState((s) => ({ ...s, tab }))}
        onOpenChange={onOpenChange}
        onLogin={onLogin}
        onRegister={onRegister}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used inside <AuthModalProvider>');
  return ctx;
}
