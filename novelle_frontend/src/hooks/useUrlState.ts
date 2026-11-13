import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface UrlStateOptions {
  /** push a history entry (page change) instead of replacing the current one (typing, toggles) */
  push?: boolean;
}

/**
 * Typed state stored in the URL search params: `parse` reads it (must never throw), `serialize` writes
 * it back with defaults left out. Back/forward and shared links restore the same state.
 */
export function useUrlState<T>(parse: (params: URLSearchParams) => T, serialize: (value: T) => URLSearchParams) {
  const [params, setParams] = useSearchParams();
  const value = useMemo(() => parse(params), [params, parse]);

  const set = useCallback(
    (next: T | ((current: T) => T), options: UrlStateOptions = {}) => {
      setParams(
        (current) => {
          const resolved = typeof next === 'function' ? (next as (c: T) => T)(parse(current)) : next;
          return serialize(resolved);
        },
        { replace: !options.push },
      );
    },
    [setParams, parse, serialize],
  );

  return [value, set] as const;
}
