import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getGenres } from '@/api/catalog';
import { queryKeys } from '@/api/queryKeys';

/** The 20 genres (GET /api/genres), shared by the genre bar, the home page and the search filters. */
export function useGenres() {
  return useQuery({ queryKey: queryKeys.genres, queryFn: getGenres, staleTime: 60 * 60_000 });
}

/** "<title> · Novelle" in the browser tab while the page is shown. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Novelle` : 'Novelle';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
