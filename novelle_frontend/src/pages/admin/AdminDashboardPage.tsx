import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, Layers, RefreshCw, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getStatsGenres,
  getStatsOverview,
  getStatsTopAuthors,
  getStatsUsers,
  getStatsViews,
} from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import {
  GenreBars,
  TopAuthorsTable,
  UserGrowthChart,
  type GenreMetric,
} from '@/components/admin/AdminCharts';
import { ErrorResult } from '@/components/common/ErrorResult';
import { StatCard, ViewsChart } from '@/components/studio/DashboardParts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import { avgChapters } from '@/types/admin';
import { DASHBOARD_RANGES, pctChange, rangeQueries, type DashboardRange } from '@/types/studio';
import { formatCompact, formatNumber, formatSignedPct, formatTime } from '@/utils/format';

/** S1–S5 are cached on the server (D6), so a minute on the client is enough. */
const STALE = 60_000;
const ICON = 'size-6 text-muted-foreground';

/** "Người đọc 12.135 · Tác giả 342": each part stays on one line. */
function Parts({ parts }: { parts: [string, number][] }) {
  return (
    <>
      {parts.map(([label, n], i) => (
        <span key={label} className="whitespace-nowrap">
          {i > 0 && ' · '}
          {label} {formatNumber(n)}
        </span>
      ))}
    </>
  );
}

/** One block of the page: its data, a skeleton while loading, a retry box on error. */
function Slot<T>({
  q,
  height,
  className,
  title,
  children,
}: {
  q: { data?: T; isError: boolean; refetch: () => unknown };
  height: string;
  className: string;
  title: string;
  children: (d: T) => React.ReactNode;
}) {
  if (q.isError)
    return (
      <div className={cn('min-w-0', className)}>
        <ErrorResult title={title} onRetry={() => q.refetch()} />
      </div>
    );
  if (q.data === undefined) return <Skeleton className={cn('min-w-0 rounded-lg', height, className)} />;
  return <>{children(q.data)}</>;
}

/**
 * AD1 · Thống kê (/admin/dashboard?range=7d|30d|12m, board AdminDashboard): "Toàn hệ thống · cập nhật lúc …"
 * (time the overview was loaded, the server caches it) + "Tải lại"; cards Người dùng (by role), Truyện (by
 * status), Chương (+ average per story), Lượt xem of the range (+ change against the period before, a second
 * S2); views over time; genres (S3, Truyện / Lượt xem, all time); new users per month (S4); authors above the
 * average (S5).
 */
export default function AdminDashboardPage() {
  useDocumentTitle('Thống kê');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const raw = params.get('range');
  const range: DashboardRange = DASHBOARD_RANGES.some((r) => r.value === raw)
    ? (raw as DashboardRange)
    : '30d';
  const q = useMemo(() => rangeQueries(range), [range]);
  const [metric, setMetric] = useState<GenreMetric>('stories');

  const overview = useQuery({
    queryKey: queryKeys.admin.stats.overview,
    queryFn: getStatsOverview,
    staleTime: STALE,
  });
  const views = useQuery({
    queryKey: queryKeys.admin.stats.views(q.current),
    queryFn: () => getStatsViews(q.current),
    staleTime: STALE,
  });
  const previous = useQuery({
    queryKey: queryKeys.admin.stats.views(q.previous),
    queryFn: () => getStatsViews(q.previous),
    staleTime: STALE,
  });
  const genres = useQuery({
    queryKey: queryKeys.admin.stats.genres,
    queryFn: getStatsGenres,
    staleTime: STALE,
  });
  const growth = useQuery({
    queryKey: queryKeys.admin.stats.users,
    queryFn: () => getStatsUsers(12),
    staleTime: STALE,
  });
  const top = useQuery({
    queryKey: queryKeys.admin.stats.topAuthors,
    queryFn: () => getStatsTopAuthors(10),
    staleTime: STALE,
  });

  const o = overview.data;
  const change = views.data && previous.data ? pctChange(views.data.total, previous.data.total) : null;
  const periodWord = range === '12m' ? '12 tháng trước đó' : 'kỳ trước';
  const refreshing =
    overview.isFetching || views.isFetching || genres.isFetching || growth.isFetching || top.isFetching;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">
            Thống kê
          </h1>
          <p className="mt-1 flex items-center gap-2 text-muted-foreground">
            <span>
              Toàn hệ thống
              {overview.dataUpdatedAt > 0 &&
                ` · cập nhật lúc ${formatTime(new Date(overview.dataUpdatedAt).toISOString())}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={refreshing}
              onClick={() => void qc.invalidateQueries({ queryKey: queryKeys.admin.stats.all })}
            >
              <RefreshCw
                className={cn('size-3.5', refreshing && 'animate-spin')}
                strokeWidth={1.75}
                aria-hidden
              />{' '}
              Tải lại
            </Button>
          </p>
        </div>
        <div
          role="group"
          aria-label="Khoảng thời gian"
          className="inline-flex rounded-[10px] bg-secondary p-[3px]"
        >
          {DASHBOARD_RANGES.map((r) => {
            const on = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => setParams(r.value === '30d' ? {} : { range: r.value }, { replace: true })}
                className={cn(
                  'h-[34px] rounded-md px-3.5 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
                  on
                    ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </header>

      {overview.isError ? (
        <ErrorResult title="Chưa tải được số liệu tổng quan" onRetry={() => overview.refetch()} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {o ? (
            <>
              <StatCard
                label="Người dùng"
                value={formatNumber(o.users.total)}
                icon={<Users aria-hidden className={ICON} strokeWidth={1.75} />}
                note={
                  <Parts
                    parts={[
                      ['Người đọc', o.users.byRole.READER ?? 0],
                      ['Tác giả', o.users.byRole.AUTHOR ?? 0],
                      ['Admin', o.users.byRole.ADMIN ?? 0],
                    ]}
                  />
                }
              />
              <StatCard
                label="Truyện"
                value={formatNumber(o.stories.total)}
                icon={<BookOpen aria-hidden className={ICON} strokeWidth={1.75} />}
                note={
                  <Parts
                    parts={[
                      ['Đã đăng', o.stories.byStatus.PUBLISHED ?? 0],
                      ['Nháp', o.stories.byStatus.DRAFT ?? 0],
                      ['Ẩn', o.stories.byStatus.HIDDEN ?? 0],
                    ]}
                  />
                }
              />
              <StatCard
                label="Chương đã đăng"
                value={formatNumber(o.chapters.published)}
                icon={<Layers aria-hidden className={ICON} strokeWidth={1.75} />}
                note={`Trung bình ${avgChapters(o.chapters.published, o.stories.total).toLocaleString('vi-VN')} chương mỗi truyện · ${formatCompact(o.totalWords)} chữ`}
              />
            </>
          ) : (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px] rounded-lg" />)
          )}
          {views.data ? (
            <StatCard
              label={`Lượt xem · ${DASHBOARD_RANGES.find((r) => r.value === range)!.label}`}
              value={formatNumber(views.data.total)}
              icon={<Eye aria-hidden className={ICON} strokeWidth={1.75} />}
              note={
                change === null
                  ? `Chưa có số liệu ${periodWord} để so`
                  : `${formatSignedPct(change)} so với ${periodWord}`
              }
              trend={change === null ? null : change >= 0 ? 'up' : 'down'}
            />
          ) : (
            <Skeleton className="h-[118px] rounded-lg" />
          )}
        </div>
      )}

      <div className="flex">
        <Slot q={views} height="h-[340px]" className="flex-1" title="Chưa tải được lượt xem">
          {(s) => <ViewsChart series={s} />}
        </Slot>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Slot q={growth} height="h-[360px]" className="flex-[1_1_420px]" title="Chưa tải được người dùng mới">
          {(g) => <UserGrowthChart growth={g} />}
        </Slot>
        <Slot
          q={genres}
          height="h-[360px]"
          className="flex-[1_1_340px]"
          title="Chưa tải được số liệu thể loại"
        >
          {(g) => <GenreBars genres={g} metric={metric} onMetric={setMetric} />}
        </Slot>
      </div>

      <div className="flex">
        <Slot q={top} height="h-[320px]" className="flex-1" title="Chưa tải được bảng tác giả">
          {(t) =>
            t.items.length ? (
              <TopAuthorsTable top={t} />
            ) : (
              <p className="flex-1 rounded-lg border border-border bg-card px-6 py-10 text-center text-muted-foreground">
                Chưa có tác giả nào vượt lượt xem trung bình.
              </p>
            )
          }
        </Slot>
      </div>
    </div>
  );
}
