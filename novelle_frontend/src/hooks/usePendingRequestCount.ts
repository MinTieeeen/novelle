import { useQuery } from '@tanstack/react-query';
import { getAdminRequests } from '@/api/authorRequests';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Number of pending author requests (admin sidebar, AD3 tab): A4 with status=PENDING&size=1 →
 * totalElements. Refreshed every minute and when the window gets focus; undefined until known.
 */
export function usePendingRequestCount(): number | undefined {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: queryKeys.admin.authorRequests.pendingCount,
    queryFn: () => getAdminRequests({ status: 'PENDING', page: 0, size: 1 }),
    enabled: user?.role === 'ADMIN',
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    select: (p) => p.totalElements,
  });
  return q.data;
}
