import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters of an admin list kept on the URL (AD2 ?q=&role=…, AD5 ?q=&status=…) plus the id of the open
 * detail sheet (`?user=` / `?story=`). Changing a filter goes back to page 0 and replaces the history
 * entry; opening a sheet or a page pushes one, so Back closes the sheet / returns to the previous page.
 */
export function useAdminFilters<F extends { page: number }>(
  parse: (p: URLSearchParams) => F,
  serialize: (f: F, keep: Record<string, string | undefined>) => URLSearchParams,
  detailParam: string,
) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parse(params), [params, parse]);
  const raw = params.get(detailParam);
  const selected = raw && /^\d{1,9}$/.test(raw) ? Number(raw) : null;

  const write = useCallback(
    (next: F, sel: number | null, push: boolean) => setParams(serialize(next, { [detailParam]: sel ? String(sel) : undefined }), { replace: !push }),
    [setParams, serialize, detailParam],
  );

  const update = useCallback((patch: Partial<F>) => write({ ...filters, ...patch, page: 0 }, selected, false), [write, filters, selected]);
  const setPage = useCallback((page: number) => write({ ...filters, page }, selected, true), [write, filters, selected]);
  const select = useCallback((id: number | null) => write(filters, id, id !== null), [write, filters]);

  return { filters, update, setPage, selected, select };
}
