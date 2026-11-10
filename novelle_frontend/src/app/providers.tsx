import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { setHttpErrorHandlers } from '@/api/http';
import { queryKeys } from '@/api/queryKeys';
import { queryClient } from '@/app/queryClient';
import { router } from '@/app/router';
import { AuthProvider } from '@/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { bannedDescription, rateLimitedMessage } from '@/utils/errors';

/** Drop every personal query and mark the visitor as a guest. */
function clearSession() {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
  queryClient.setQueryData(queryKeys.me, null);
}

/**
 * Global reactions to API errors (README §5.3, module-users §10.5). 401 clears the user and opens
 * /login with a redirect back; ACCOUNT_BANNED mid-session clears everything and goes home with a toast;
 * 403 pages are rendered by the route guard or the page itself; 409 is left to the caller.
 * Navigation goes through the router (no reload), so toasts survive.
 */
function useHttpErrorHandlers() {
  useEffect(() => {
    setHttpErrorHandlers({
      onUnauthenticated: () => {
        queryClient.setQueryData(queryKeys.me, null);
        const { pathname, search } = window.location;
        if (!pathname.startsWith('/login')) {
          void router.navigate(`/login?redirect=${encodeURIComponent(pathname + search)}`, { replace: true });
        }
      },
      onBanned: (error) => {
        clearSession();
        toast.error('Tài khoản đã bị khoá', { id: 'account-banned', description: bannedDescription(error) });
        void router.navigate('/', { replace: true });
      },
      onRateLimited: (error) => {
        toast.warning(rateLimitedMessage(error), { id: 'rate-limited' });
      },
      onServerError: (error) => {
        const message =
          error.status === 0
            ? 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
            : 'Máy chủ đang gặp lỗi. Thử lại sau ít phút.';
        toast.error(message, { id: 'server-error' });
      },
    });
    return () => setHttpErrorHandlers({});
  }, []);
}

export function AppProviders({ children }: { children: ReactNode }) {
  useHttpErrorHandlers();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
