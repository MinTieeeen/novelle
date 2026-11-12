import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { PageResponse } from '@/types/api';

/**
 * A paged list read page by page with "Xem thêm" (library blocks, reviews): flat `items`, `total` from the
 * first page, `loadMore()` and `hasMore`.
 */
export function useLoadMore<T>(
  queryKey: QueryKey,
  fetchPage: (page: number) => Promise<PageResponse<T>>,
  options: { enabled?: boolean; staleTime?: number } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    enabled: options.enabled,
    staleTime: options.staleTime ?? 30_000,
  });
  const pages = query.data?.pages ?? [];
  return {
    query,
    items: pages.flatMap((p) => p.items),
    total: pages[0]?.totalElements ?? 0,
    hasMore: !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
}
