import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { setHttpErrorHandlers } from '@/api/http';
import { queryKeys } from '@/api/queryKeys';
import { queryClient } from '@/app/queryClient';
import { ThemeProvider } from '@/app/ThemeProvider';
import { AuthProvider } from '@/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Global reactions to API errors (README §5.3). 401 clears the user and sends them to /login with a
 * redirect back; 403 pages are rendered by the route guard or the page itself; 409 is left to the caller.
 */
function useHttpErrorHandlers() {
  useEffect(() => {
    setHttpErrorHandlers({
      onUnauthenticated: () => {
        queryClient.setQueryData(queryKeys.me, null);
        const here = window.location.pathname + window.location.search;
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign(`/login?redirect=${encodeURIComponent(here)}`);
        }
      },
      onRateLimited: () => {
        toast.warning('Bạn thao tác quá nhanh. Thử lại sau ít phút.', { id: 'rate-limited' });
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
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
