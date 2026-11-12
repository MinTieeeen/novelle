import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { queryKeys } from '@/api/queryKeys';
import { getDashboardFollowers, getDashboardOverview, getDashboardStories, getDashboardViews } from '@/api/studio';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorResult } from '@/components/common/ErrorResult';
import { RecentFollowers, StatCard, StoryStatsTable, ViewsChart } from '@/components/studio/DashboardParts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import { DASHBOARD_RANGES, pctChange, rangeQueries, type DashboardRange } from '@/types/studio';
import { formatNumber, formatRating, formatSignedPct } from '@/utils/format';

const STALE = 60_000;

/**
 * S5 · Dashboard (/studio/dashboard?range=7d|30d|12m, board StudioDashboard): range buttons; cards Lượt xem
 * (period total + change against the period right before, a second D2), Người theo dõi (+N in 30 days, D4),
 * Điểm trung bình (on N ratings, D1); the views line chart; new followers; the per-story table (D3).
 */
export default function AuthorDashboardPage() {
  useDocumentTitle('Dashboard');
  const [params, setParams] = useSearchParams();
  const raw = params.get('range');
  const range: DashboardRange = DASHBOARD_RANGES.some((r) => r.value === raw) ? (raw as DashboardRange) : '30d';
  const q = useMemo(() => rangeQueries(range), [range]);

  const overview = useQuery({ queryKey: queryKeys.studio.dashboard.overview, queryFn: getDashboardOverview, staleTime: STALE });
  const views = useQuery({ queryKey: queryKeys.studio.dashboard.views(q.current), queryFn: () => getDashboardViews(q.current), staleTime: STALE });
  const previous = useQuery({ queryKey: queryKeys.studio.dashboard.views(q.previous), queryFn: () => getDashboardViews(q.previous), staleTime: STALE });
  const stories = useQuery({ queryKey: queryKeys.studio.dashboard.stories, queryFn: getDashboardStories, staleTime: STALE });
  const followers = useQuery({ queryKey: queryKeys.studio.dashboard.followers, queryFn: getDashboardFollowers, staleTime: STALE });

  const o = overview.data;
  const change = views.data && previous.data ? pctChange(views.data.total, previous.data.total) : null;
  const periodWord = range === '12m' ? '12 tháng trước đó' : 'kỳ trước';

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">{o && `${formatNumber(o.publishedStoryCount)} truyện đã đăng · ${formatNumber(o.chapterCount)} chương`}</p>
      </div>
      <div role="group" aria-label="Khoảng thời gian" className="inline-flex rounded-[10px] bg-secondary p-[3px]">
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
                on ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </header>
  );

  if (overview.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorResult title="Chưa tải được số liệu" onRetry={() => overview.refetch()} />
      </div>
    );
  }
  if (o && o.storyCount === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="Chưa có số liệu"
          description="Tạo truyện và đăng chương đầu tiên, số liệu lượt xem và người theo dõi sẽ hiện ở đây."
          action={
            <Button asChild>
              <Link to="/studio/stories/new">Tạo truyện</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {views.data ? (
          <StatCard
            label={`Lượt xem · ${DASHBOARD_RANGES.find((r) => r.value === range)!.label}`}
            value={formatNumber(views.data.total)}
            note={change === null ? `Chưa có số liệu ${periodWord} để so` : `${formatSignedPct(change)} so với ${periodWord}`}
            trend={change === null ? null : change >= 0 ? 'up' : 'down'}
          />
        ) : (
          <Skeleton className="h-[118px] rounded-lg" />
        )}
        {o && followers.data ? (
          <StatCard
            label="Người theo dõi"
            value={formatNumber(o.followerCount)}
            note={`+${formatNumber(followers.data.newFollowers30d)} trong 30 ngày`}
            trend={followers.data.newFollowers30d > 0 ? 'up' : null}
          />
        ) : (
          <Skeleton className="h-[118px] rounded-lg" />
        )}
        {o ? (
          <StatCard
            label="Điểm trung bình"
            value={o.ratingCount > 0 ? formatRating(o.ratingAvg) : '–'}
            icon={o.ratingCount > 0 ? <Star aria-hidden className="size-6 fill-nghe text-nghe" strokeWidth={1.75} /> : undefined}
            note={o.ratingCount > 0 ? `trên ${formatNumber(o.ratingCount)} đánh giá` : 'Chưa có đánh giá'}
          />
        ) : (
          <Skeleton className="h-[118px] rounded-lg" />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {views.isError ? (
          <div className="min-w-0 flex-[999_1_560px]">
            <ErrorResult title="Chưa tải được lượt xem" onRetry={() => views.refetch()} />
          </div>
        ) : views.data ? (
          <ViewsChart series={views.data} />
        ) : (
          <Skeleton className="h-[340px] min-w-0 flex-[999_1_560px] rounded-lg" />
        )}
        {followers.data ? <RecentFollowers followers={followers.data} /> : <Skeleton className="h-[340px] min-w-0 flex-[1_1_280px] rounded-lg" />}
      </div>

      {stories.isError ? (
        <ErrorResult title="Chưa tải được số liệu từng truyện" onRetry={() => stories.refetch()} />
      ) : stories.data ? (
        <StoryStatsTable stories={stories.data} />
      ) : (
        <Skeleton className="h-[260px] rounded-lg" />
      )}
    </div>
  );
}
