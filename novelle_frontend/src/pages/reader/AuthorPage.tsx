import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAuthor, getAuthorStories, type AuthorStoriesQuery } from '@/api/authors';
import { queryKeys } from '@/api/queryKeys';
import { AppPagination } from '@/components/common/AppPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorResult } from '@/components/common/ErrorResult';
import { AuthorFollowAction } from '@/components/library/AuthorFollowAction';
import { AuthorHeader } from '@/components/story/AuthorBlocks';
import { SortSelect } from '@/components/story/SortSelect';
import { StoryCard } from '@/components/story/StoryCard';
import { StoryGridSkeleton } from '@/components/story/StorySkeletons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useUrlState } from '@/hooks/useUrlState';
import { hasCode } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

const PAGE_SIZE = 24;
const SORTS = ['updated', 'newest', 'views', 'rating', 'follows'] as const;
type AuthorSort = (typeof SORTS)[number];

interface AuthorListState {
  sort: AuthorSort;
  /** 0-based */
  page: number;
}

const parse = (p: URLSearchParams): AuthorListState => {
  const sort = SORTS.find((s) => s === p.get('sort')) ?? 'updated';
  const page = Number(p.get('page'));
  return { sort, page: Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 0 };
};
const serialize = (s: AuthorListState) => {
  const out = new URLSearchParams();
  if (s.sort !== 'updated') out.set('sort', s.sort);
  if (s.page > 0) out.set('page', String(s.page));
  return out;
};

/** R4 · Trang tác giả (AuthorPage board): AuthorHeader + the author's public stories (sort, pages in the URL). */
export default function AuthorPage() {
  const { authorId: raw = '' } = useParams();
  const authorId = /^\d+$/.test(raw) ? Number(raw) : null;
  const [list, setList] = useUrlState(parse, serialize);
  const query: AuthorStoriesQuery = { sort: list.sort, page: list.page, size: PAGE_SIZE };

  const author = useQuery({
    queryKey: queryKeys.authors.detail(authorId ?? 0),
    queryFn: () => getAuthor(authorId!),
    enabled: authorId != null,
    staleTime: 5 * 60_000,
  });
  const stories = useQuery({
    queryKey: queryKeys.authors.stories(authorId ?? 0, query),
    queryFn: () => getAuthorStories(authorId!, query),
    enabled: authorId != null && author.isSuccess,
    placeholderData: keepPreviousData,
  });
  useDocumentTitle(author.data?.penName);
  // Braces: in recent Chromium scrollTo returns a Promise, which React would take for a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [list.page]);

  const setPage = useCallback((page: number) => setList((s) => ({ ...s, page }), { push: true }), [setList]);

  const notFound = authorId == null || hasCode(author.error, 'AUTHOR_NOT_FOUND', 'NOT_FOUND');
  if (notFound) {
    return (
      <ErrorResult
        variant="not-found"
        title="Không tìm thấy tác giả này"
        description="Đường dẫn có thể đã đổi."
        action={
          <Button asChild>
            <Link to="/search">Tìm truyện</Link>
          </Button>
        }
      />
    );
  }
  if (author.isError) return <ErrorResult title="Chưa tải được trang tác giả" onRetry={() => author.refetch()} />;

  if (author.isPending) {
    return (
      <div className="flex flex-col gap-10" role="status" aria-label="Đang tải trang tác giả">
        <Skeleton className="h-[260px] w-full rounded-lg" />
        <StoryGridSkeleton count={6} />
      </div>
    );
  }

  const a = author.data;
  const data = stories.data;

  return (
    <>
      <AuthorHeader author={a} actionSlot={<AuthorFollowAction author={a} />} />
      <section aria-labelledby="author-stories" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="author-stories" className="text-title-2 font-semibold">
            Truyện của {a.penName}{' '}
            <span className="num font-sans text-label font-normal text-muted-foreground">{formatNumber(a.stats.storyCount)} truyện</span>
          </h2>
          <SortSelect id="author-sort" value={list.sort} onChange={(sort) => setList({ sort: sort as AuthorSort, page: 0 })} />
        </div>

        {stories.isError && !data ? (
          <ErrorResult title="Chưa tải được danh sách truyện" onRetry={() => stories.refetch()} />
        ) : !data ? (
          <StoryGridSkeleton count={6} />
        ) : data.items.length === 0 ? (
          <EmptyState title="Tác giả chưa có truyện công khai" description="Khi tác giả đăng truyện, truyện sẽ hiện ở đây." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6">
              {data.items.map((s) => (
                <StoryCard key={s.storyId} story={s} />
              ))}
            </div>
            {data.totalPages > 1 && (
              <AppPagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPageChange={setPage} />
            )}
          </>
        )}
      </section>
    </>
  );
}
