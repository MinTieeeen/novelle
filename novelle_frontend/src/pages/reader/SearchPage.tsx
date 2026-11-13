import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTags } from '@/api/catalog';
import { isApiError } from '@/api/http';
import { queryKeys } from '@/api/queryKeys';
import { searchStories } from '@/api/stories';
import { AppPagination } from '@/components/common/AppPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorResult } from '@/components/common/ErrorResult';
import { SortSelect, ViewToggle } from '@/components/story/SortSelect';
import { StoryCard } from '@/components/story/StoryCard';
import { ActiveFilterChips, StoryFilters } from '@/components/story/StoryFilters';
import { StoryListItem } from '@/components/story/StoryListItem';
import { StoryGridSkeleton, StoryListSkeleton } from '@/components/story/StorySkeletons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useDocumentTitle, useGenres } from '@/hooks/useCatalog';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchFilters } from '@/hooks/useSearchFilters';
import { cn } from '@/lib/utils';
import type { StorySort } from '@/types/story';
import { activeFilterCount } from '@/types/storySearch';
import { formatNumber } from '@/utils/format';

/**
 * R2 · Tìm kiếm (Search board): every filter lives in the URL (useSearchFilters), so back / forward and
 * shared links restore the same results. The request runs only when the URL changes (Enter in the
 * header, a filter, a page). Previous results stay on screen while the next page loads, and on a 429.
 */
export default function SearchPage() {
  const { filters, update, setPage, reset } = useSearchFilters();
  const genres = useGenres();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const previousPage = useRef(filters.page);

  const results = useQuery({
    queryKey: queryKeys.stories.search(filters),
    queryFn: ({ signal }) => searchStories(filters, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Tag suggestions of the filter panel (the only typed input that queries: debounced).
  const [tagQuery, setTagQuery] = useState('');
  const debouncedTag = useDebounce(tagQuery.trim(), 300);
  const tags = useQuery({
    queryKey: queryKeys.tags(debouncedTag),
    queryFn: ({ signal }) => getTags(debouncedTag, 8, signal),
    enabled: debouncedTag.length > 0,
    staleTime: 5 * 60_000,
  });
  // Names of tags picked from suggestions, for the pills (the URL only holds slugs).
  const [tagNames, setTagNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (tags.data?.length) setTagNames((m) => ({ ...m, ...Object.fromEntries(tags.data.map((t) => [t.slug, t.name])) }));
  }, [tags.data]);

  const genreList = genres.data ?? [];
  const singleGenre = filters.genres.length === 1 ? genreList.find((g) => g.slug === filters.genres[0]) : undefined;
  const title = filters.q ? `Kết quả cho “${filters.q}”` : singleGenre ? `Truyện ${singleGenre.name}` : 'Tất cả truyện';
  useDocumentTitle(title);

  // Back to the top of the results when the page changes.
  // Braces: in recent Chromium scrollTo returns a Promise, which React would take for a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // After a page change from the pagination at the bottom, keyboard focus goes to the top of the results.
    if (filters.page !== previousPage.current) resultsRef.current?.focus({ preventScroll: true });
    previousPage.current = filters.page;
  }, [filters.page]);

  const sort: StorySort = filters.sort ?? (filters.q ? 'relevance' : 'updated');
  const count = activeFilterCount(filters);
  const data = results.data;
  const rateLimited = isApiError(results.error) && results.error.code === 'RATE_LIMITED';

  const filterPanel = (
    <StoryFilters
      filters={filters}
      onChange={update}
      onReset={reset}
      genres={genreList}
      tagSuggestions={tags.data ?? []}
      onTagQueryChange={setTagQuery}
      tagNames={tagNames}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Trang chủ
          </Link>
          {' › '}
          {singleGenre ? singleGenre.name : 'Tìm kiếm'}
        </nav>
        <h1 className="text-title-1 font-semibold break-words">{title}</h1>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="hidden w-[300px] shrink-0 lg:block">{filterPanel}</div>

        <section ref={resultsRef} tabIndex={-1} aria-label="Kết quả" className="flex min-w-0 flex-1 flex-col gap-4 outline-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-muted-foreground">
              {data ? (
                <>
                  <span className="num font-semibold text-foreground">{formatNumber(data.totalElements)} truyện</span>
                  {(filters.q || count > 0) && ' khớp từ khoá và bộ lọc'}
                </>
              ) : (
                'Đang tìm…'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden">
                    <SlidersHorizontal /> Bộ lọc{count > 0 && ` (${count})`}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(340px,100vw)] gap-0 p-0">
                  <SheetTitle className="sr-only">Bộ lọc</SheetTitle>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-12 [&_aside]:border-0 [&_aside]:p-0">{filterPanel}</div>
                  {/* Filters apply at once; this closes the sheet to show the results behind it. */}
                  <div className="border-t border-border bg-card p-4">
                    <Button className="w-full" onClick={() => setFiltersOpen(false)}>
                      {data ? `Xem ${formatNumber(data.totalElements)} truyện` : 'Xem kết quả'}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <SortSelect value={sort} allowRelevance={!!filters.q} onChange={(s) => update({ sort: s })} />
              <ViewToggle value={filters.view} onChange={(view) => update({ view, page: filters.page })} />
            </div>
          </div>

          <ActiveFilterChips filters={filters} genres={genreList} tagNames={tagNames} onChange={update} />

          {results.isError && !data ? (
            rateLimited ? (
              <ErrorResult title="Bạn tìm quá nhanh" description="Chờ một lát rồi thử lại." onRetry={() => results.refetch()} />
            ) : (
              <ErrorResult title="Chưa tải được kết quả" onRetry={() => results.refetch()} />
            )
          ) : !data ? (
            filters.view === 'list' ? <StoryListSkeleton /> : <StoryGridSkeleton />
          ) : data.items.length === 0 ? (
            <EmptyState
              title="Không có truyện nào khớp"
              description={count > 0 ? 'Bỏ bớt bộ lọc hoặc thử từ khoá khác.' : 'Thử từ khoá khác hoặc xem các thể loại.'}
              action={count > 0 ? <Button onClick={reset}>Xoá bộ lọc</Button> : undefined}
            />
          ) : (
            <>
              <div className={cn('transition-opacity', results.isPlaceholderData && 'opacity-60')} aria-busy={results.isFetching}>
                {filters.view === 'list' ? (
                  <div className="flex flex-col gap-4">
                    {data.items.map((s) => (
                      <StoryListItem key={s.storyId} story={s} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6">
                    {data.items.map((s) => (
                      <StoryCard key={s.storyId} story={s} />
                    ))}
                  </div>
                )}
              </div>
              <AppPagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPageChange={setPage} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
