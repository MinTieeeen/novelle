import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getAdminStories, getAdminUsers, getStatsOverview } from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import { getRatings } from '@/api/ratings';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { AdminSearch } from '@/components/admin/AdminSearch';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { AuthorFilter, ModerationRow, StoryDetailSheet } from '@/components/admin/StoryParts';
import { STORY_GRID, TABLE, TABLE_HEAD_XL } from '@/components/admin/adminStyles';
import { AppPagination } from '@/components/common/AppPagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminStoryActions } from '@/hooks/useAdminActions';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { HIDE_REASONS, parseStoryFilters, toStoryParams, type AdminStoryItem } from '@/types/admin';
import type { Rating } from '@/types/rating';
import type { PublishStatus } from '@/types/studio';

const PAGE_SIZE = 20;
/** same page size as the public ratings block, so both share the cached pages */
const REVIEW_PAGE = 10;

type Target = Pick<AdminStoryItem, 'storyId' | 'slug' | 'title'>;

/**
 * AD5 · Kiểm duyệt truyện (/admin/stories?q=&status=&authorId=&page=&story=, board AdminStories): search,
 * status tabs (counts from S1), author filter (U1 role=AUTHOR, AuthorId = UserId), the table (C1), paging;
 * the detail sheet opens from `?story=` (Back closes it): hide with a reason (C2), unhide (C3), readers'
 * reviews of a published story (D1) with delete (C5), delete the story (C4).
 */
export default function StoriesModerationPage() {
  useDocumentTitle('Kiểm duyệt truyện');
  const { filters, update, setPage, selected, select } = useAdminFilters(parseStoryFilters, toStoryParams, 'story');
  /** last known copy of the open story: keeps the sheet filled when the row leaves the filtered page */
  const [snapshot, setSnapshot] = useState<AdminStoryItem | null>(null);
  const [authorName, setAuthorName] = useState<{ authorId: number; penName: string } | null>(null);
  const [authorQ, setAuthorQ] = useState('');
  const [hiding, setHiding] = useState<Target | null>(null);
  const [unhiding, setUnhiding] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<Target | null>(null);
  const [review, setReview] = useState<{ storyId: number; rating: Rating } | null>(null);
  const actions = useAdminStoryActions({
    onStory: (s) => setSnapshot(s),
    onDeleted: (id) => {
      setDeleting(null);
      if (selected === id) select(null);
    },
  });

  const query = { q: filters.q || undefined, publishStatus: filters.status, authorId: filters.authorId, page: filters.page, size: PAGE_SIZE };
  const list = useQuery({ queryKey: queryKeys.admin.stories.list(query), queryFn: () => getAdminStories(query), placeholderData: keepPreviousData });
  const overview = useQuery({ queryKey: queryKeys.admin.stats.overview, queryFn: getStatsOverview, staleTime: 60_000 });
  const items = list.data?.items ?? [];

  const dq = useDebounce(authorQ.trim(), 300);
  const authorQuery = { role: 'AUTHOR' as const, q: dq || undefined, size: 8 };
  const authors = useQuery({
    queryKey: queryKeys.admin.users.list(authorQuery),
    queryFn: () => getAdminUsers(authorQuery),
    enabled: !filters.authorId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const story = items.find((s) => s.storyId === selected) ?? (snapshot?.storyId === selected ? snapshot : undefined);
  // ?story= that is not on this page (or no longer exists): say so and close the sheet
  const missing = selected !== null && !story && list.isSuccess && !list.isPlaceholderData && !list.isFetching;
  useEffect(() => {
    if (missing) {
      toast.error('Không tìm thấy truyện này trong danh sách đang lọc.');
      select(null);
    }
  }, [missing, select]);

  const published = story?.publishStatus === 'PUBLISHED';
  const ratings = useInfiniteQuery({
    queryKey: queryKeys.ratings.list(story?.storyId ?? 0),
    queryFn: ({ pageParam }) => getRatings(story!.storyId, { page: pageParam, size: REVIEW_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.reviews.page + 1 < last.reviews.totalPages ? last.reviews.page + 1 : undefined),
    enabled: !!story && published,
    staleTime: 60_000,
  });

  // pen name of the author filter: from the choice, else from a row of that author
  const author =
    filters.authorId === undefined
      ? undefined
      : {
          authorId: filters.authorId,
          penName:
            (authorName?.authorId === filters.authorId ? authorName.penName : undefined) ?? items.find((s) => s.author.authorId === filters.authorId)?.author.penName,
        };

  const o = overview.data?.stories;
  const tabs: { value: PublishStatus | 'ALL'; label: string; count?: number }[] = [
    { value: 'ALL', label: 'Tất cả', count: o?.total },
    { value: 'PUBLISHED', label: 'Đã đăng', count: o?.byStatus.PUBLISHED },
    { value: 'DRAFT', label: 'Bản nháp', count: o?.byStatus.DRAFT },
    { value: 'HIDDEN', label: 'Bị ẩn', count: o?.byStatus.HIDDEN },
  ];
  const open = (s: AdminStoryItem) => {
    setSnapshot(s);
    select(s.storyId);
  };
  const toggleHide = (s: AdminStoryItem) => (s.publishStatus === 'HIDDEN' ? setUnhiding(s) : setHiding(s));
  const filterAuthor = (a: { authorId: number; penName: string } | null) => {
    setAuthorName(a);
    setAuthorQ('');
    update({ authorId: a?.authorId });
  };
  const filtered = !!(filters.q || filters.status || filters.authorId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Kiểm duyệt truyện</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <AdminSearch value={filters.q} onSearch={(q) => update({ q })} label="Tìm truyện" placeholder="Tìm tên truyện" />
        <AdminFilterTabs label="Trạng thái truyện" tabs={tabs} value={filters.status ?? 'ALL'} onChange={(v) => update({ status: v === 'ALL' ? undefined : v })} />
        <AuthorFilter value={author} onChange={filterAuthor} results={authors.data?.items} query={authorQ} onQueryChange={setAuthorQ} loading={authors.isFetching} />
      </div>

      {list.isError ? (
        <ErrorResult title="Chưa tải được danh sách truyện" onRetry={() => list.refetch()} />
      ) : (
        <section aria-label="Danh sách truyện" aria-busy={list.isFetching} className={TABLE}>
          <div className={cn(TABLE_HEAD_XL, STORY_GRID)}>
            <span>Truyện</span>
            <span>Tác giả</span>
            <span>Trạng thái</span>
            <span>Chương</span>
            <span>Lượt xem</span>
            <span>Điểm</span>
            <span />
          </div>
          {!list.data ? (
            <ul aria-label="Đang tải">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-border px-5 py-3">
                  <Skeleton className="h-14 w-10 bg-secondary" />
                  <Skeleton className="h-4 w-72 bg-secondary" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-t border-border px-5 py-12 text-center text-muted-foreground">
              <p>{filtered ? 'Không có truyện nào khớp bộ lọc.' : 'Chưa có truyện nào.'}</p>
              {filtered && (
                <Button variant="outline" size="sm" onClick={() => (setAuthorName(null), update({ q: '', status: undefined, authorId: undefined }))}>
                  Xoá bộ lọc
                </Button>
              )}
            </div>
          ) : (
            <ul>
              {items.map((s) => (
                <ModerationRow
                  key={s.storyId}
                  story={s}
                  onOpen={() => open(s)}
                  onToggleHide={() => toggleHide(s)}
                  onAuthor={() => filterAuthor({ authorId: s.author.authorId, penName: s.author.penName })}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {list.data && list.data.totalElements > 0 && (
        <AppPagination page={list.data.page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} unit="truyện" onPageChange={setPage} />
      )}

      <StoryDetailSheet
        open={selected !== null && !!story}
        onOpenChange={(v) => !v && select(null)}
        story={story}
        onToggleHide={() => story && toggleHide(story)}
        onDelete={() => story && setDeleting(story)}
        reviews={ratings.data?.pages.flatMap((p) => p.reviews.items)}
        reviewCount={ratings.data?.pages[0]?.reviews.totalElements}
        reviewsError={ratings.isError}
        hasMoreReviews={!!ratings.hasNextPage}
        loadingMoreReviews={ratings.isFetchingNextPage}
        onMoreReviews={() => void ratings.fetchNextPage()}
        onDeleteReview={(rating) => story && setReview({ storyId: story.storyId, rating })}
      />

      <ReasonDialog
        open={hiding !== null}
        onOpenChange={(v) => !v && !actions.hide.isPending && setHiding(null)}
        title={`Ẩn “${hiding?.title ?? ''}”?`}
        description="Truyện biến mất khỏi trang đọc và kết quả tìm kiếm. Tác giả vẫn thấy truyện trong Studio kèm lý do."
        reasons={HIDE_REASONS}
        notePlaceholder="Ghi chú cho tác giả (không bắt buộc)"
        confirmLabel="Ẩn truyện"
        pendingLabel="Đang ẩn…"
        pending={actions.hide.isPending}
        onConfirm={(reason) => hiding && actions.hide.mutate({ storyId: hiding.storyId, reason }, { onSettled: () => setHiding(null) })}
      />
      <ConfirmDialog
        open={unhiding !== null}
        onOpenChange={(v) => !v && !actions.unhide.isPending && setUnhiding(null)}
        title={`Bỏ ẩn “${unhiding?.title ?? ''}”?`}
        description="Truyện hiện lại với người đọc ngay sau khi bạn xác nhận."
        confirmLabel="Bỏ ẩn"
        pendingLabel="Đang bỏ ẩn…"
        pending={actions.unhide.isPending}
        onConfirm={() => unhiding && actions.unhide.mutate(unhiding.storyId, { onSettled: () => setUnhiding(null) })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && !actions.remove.isPending && setDeleting(null)}
        title={`Xoá vĩnh viễn “${deleting?.title ?? ''}”?`}
        description="Toàn bộ tập, chương, đánh giá và lượt theo dõi của truyện bị xoá. Tác giả không khôi phục được."
        confirmLabel="Xoá truyện"
        pendingLabel="Đang xoá…"
        destructive
        pending={actions.remove.isPending}
        onConfirm={() => deleting && actions.remove.mutate(deleting, { onError: () => setDeleting(null) })}
      />
      <ConfirmDialog
        open={review !== null}
        onOpenChange={(v) => !v && !actions.removeRating.isPending && setReview(null)}
        title="Xoá đánh giá này?"
        description={`Đánh giá của “@${review?.rating.user.username ?? ''}” sẽ bị xoá vĩnh viễn và điểm trung bình của truyện được tính lại. Không hoàn tác được.`}
        confirmLabel="Xoá đánh giá"
        pendingLabel="Đang xoá…"
        destructive
        pending={actions.removeRating.isPending}
        onConfirm={() =>
          review &&
          actions.removeRating.mutate(
            { storyId: review.storyId, userId: review.rating.user.userId, username: review.rating.user.username },
            { onSettled: () => setReview(null) },
          )
        }
      />
    </div>
  );
}
