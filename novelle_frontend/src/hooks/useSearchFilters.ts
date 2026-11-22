import { useCallback } from 'react';
import { useUrlState } from '@/hooks/useUrlState';
import {
  DEFAULT_SEARCH,
  parseSearchParams,
  toSearchParams,
  type StorySearchParams,
} from '@/types/storySearch';

const serialize = (p: StorySearchParams) => toSearchParams(p);

/**
 * Filters of /search kept in the URL. Changing a filter goes back to the first page; changing the page
 * adds a history entry so the back button returns to the previous page of results.
 */
export function useSearchFilters() {
  const [filters, set] = useUrlState(parseSearchParams, serialize);

  /** Merge a filter change; page resets to 0 unless the patch sets it. */
  const update = useCallback(
    (patch: Partial<StorySearchParams>) => set((current) => ({ ...current, page: 0, ...patch })),
    [set],
  );

  const setPage = useCallback((page: number) => set((current) => ({ ...current, page }), { push: true }), [set]);

  /** "Xoá bộ lọc": keep the search text, the sort and the view. */
  const reset = useCallback(
    () => set((current) => ({ ...DEFAULT_SEARCH, q: current.q, sort: current.sort, view: current.view })),
    [set],
  );

  return { filters, update, setPage, reset };
}
