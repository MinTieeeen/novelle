import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { queryKeys } from '@/api/queryKeys';
import { getDashboardOverview, getStudioStories } from '@/api/studio';
import { AppPagination } from '@/components/common/AppPagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorResult } from '@/components/common/ErrorResult';
import { StudioStoryRow } from '@/components/studio/StudioStoryRow';
import { STUDIO_ROW_GRID } from '@/components/studio/studioStyles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useStudioStoryActions } from '@/hooks/useStudioStoryActions';
import { cn } from '@/lib/utils';
import type { PublishStatus, StudioStoryCard } from '@/types/studio';
import { formatNumber } from '@/utils/format';

const PAGE_SIZE = 50;
const TABS: { value: PublishStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PUBLISHED', label: 'Đã đăng' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'HIDDEN', label: 'Bị ẩn' },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * S1 · Truyện của tôi (/studio?status=&page=, board StudioStories): title + "N truyện · N chương" (D1),
 * "Tạo truyện", status tabs, a name filter over the loaded page (S1 has no search), the table of
 * StudioStoryRow with publish / unpublish / delete.
 */
export default function MyStoriesPage() {
  useDocumentTitle('Truyện của tôi');
  const [params, setParams] = useSearchParams();
  const raw = params.get('status');
  const status = TABS.some((t) => t.value === raw) ? (raw as PublishStatus) : 'ALL';
  const page = Math.max(0, Number(params.get('page')) || 0);
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState<StudioStoryCard | null>(null);
  const actions = useStudioStoryActions({ onDeleted: () => setDeleting(null) });

  const query = { status: status === 'ALL' ? undefined : status, page, size: PAGE_SIZE };
  const list = useQuery({
    queryKey: queryKeys.studio.stories(query),
    queryFn: () => getStudioStories(query),
    placeholderData: keepPreviousData,
  });
  const overview = useQuery({ queryKey: queryKeys.studio.dashboard.overview, queryFn: getDashboardOverview, staleTime: 60_000 });

  const rows = useMemo(() => {
    const items = list.data?.items ?? [];
    const needle = fold(q.trim());
    return needle ? items.filter((s) => fold(s.title).includes(needle)) : items;
  }, [list.data, q]);

  const go = (next: { status?: PublishStatus | 'ALL'; page?: number }) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    if (s !== 'ALL') p.set('status', s);
    if (next.page) p.set('page', String(next.page));
    setParams(p, { replace: next.page === undefined });
  };

  const o = overview.data;
  const total = status === 'ALL' ? list.data?.totalElements : undefined;
  const target = (s: StudioStoryCard) => ({ storyId: s.storyId, slug: s.slug, title: s.title });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Truyện của tôi</h1>
          <p className="mt-1 min-h-6 text-muted-foreground">
            {o && `${formatNumber(o.storyCount)} truyện · ${formatNumber(o.chapterCount)} chương`}
          </p>
        </div>
        <Button asChild className="font-semibold">
          <Link to="/studio/stories/new">
            <Plus strokeWidth={1.75} /> Tạo truyện
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Lọc theo trạng thái" className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-[10px] bg-secondary p-[3px]">
          {TABS.map((t) => {
            const on = t.value === status;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => go({ status: t.value })}
                className={cn(
                  'h-[34px] shrink-0 rounded-md px-3.5 text-label font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
                  on ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {t.value === 'ALL' && total != null && <span className="num font-normal text-muted-foreground"> {formatNumber(total)}</span>}
              </button>
            );
          })}
        </div>
        <label className="relative block w-[280px] max-w-full">
          <Search aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" strokeWidth={1.75} />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm truyện của tôi" aria-label="Tìm truyện của tôi" className="pl-10" />
        </label>
      </div>

      {list.isError ? (
        <ErrorResult title="Chưa tải được truyện của bạn" onRetry={() => list.refetch()} />
      ) : list.data && list.data.totalElements === 0 && status === 'ALL' ? (
        <EmptyState
          title="Bạn chưa có truyện nào"
          description="Tạo truyện đầu tiên, thêm chương rồi đăng để người đọc thấy."
          action={
            <Button asChild>
              <Link to="/studio/stories/new">Tạo truyện</Link>
            </Button>
          }
        />
      ) : (
        <section aria-label="Danh sách truyện" aria-busy={list.isFetching} className="rounded-lg border border-border bg-card">
          <div className={cn('rounded-t-lg bg-secondary py-3 text-small font-semibold text-muted-foreground max-lg:hidden', STUDIO_ROW_GRID)}>
            <span>Truyện</span>
            <span>Trạng thái</span>
            <span>Chương</span>
            <span>Lượt xem</span>
            <span>Cập nhật</span>
            <span />
          </div>
          {list.isPending ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-border px-5 py-3 first:border-t-0 lg:first:border-t">
                <Skeleton className="h-16" />
              </div>
            ))
          ) : rows.length === 0 ? (
            <p className="border-t border-border px-5 py-14 text-center text-muted-foreground">
              {q.trim() ? `Không có truyện nào khớp “${q.trim()}”.` : 'Không có truyện nào trong mục này.'}
            </p>
          ) : (
            <ul>
              {rows.map((s) => (
                <StudioStoryRow
                  key={s.storyId}
                  story={s}
                  busy={actions.busyId === s.storyId}
                  onPublish={() => actions.publish.mutate(target(s))}
                  onUnpublish={() => actions.unpublish.mutate(target(s))}
                  onDelete={() => setDeleting(s)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {list.data && (
        <AppPagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          totalElements={list.data.totalElements}
          unit="truyện"
          onPageChange={(p) => go({ page: p })}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o2) => !o2 && setDeleting(null)}
        title="Xoá truyện này?"
        description={`“${deleting?.title ?? ''}”, toàn bộ chương và tập sẽ bị xoá vĩnh viễn. Người đọc sẽ không còn thấy truyện. Không hoàn tác được.`}
        confirmLabel="Xoá truyện"
        pendingLabel="Đang xoá…"
        destructive
        pending={actions.remove.isPending}
        onConfirm={() => deleting && actions.remove.mutate(target(deleting))}
      />
    </div>
  );
}
