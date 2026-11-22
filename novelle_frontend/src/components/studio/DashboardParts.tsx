import { Eye, Star, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { Followers, StoryStats, ViewSeries } from '@/types/studio';
import { formatCompact, formatNumber, formatRating, formatRelative } from '@/utils/format';

const card = 'rounded-lg border border-border bg-card';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** second line; `trend` colours it and adds an arrow */
  note?: ReactNode;
  trend?: 'up' | 'down' | null;
  icon?: ReactNode;
}

/** Number card of the dashboard (board StudioDashboard): label, Literata number, change line. */
export function StatCard({ label, value, note, trend, icon }: StatCardProps) {
  const Trend = trend === 'down' ? TrendingDown : TrendingUp;
  return (
    <div className={cn(card, 'flex flex-col gap-1 p-5')}>
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="num flex items-center gap-2 font-serif text-[32px] leading-10 font-semibold">
        {icon}
        {value}
      </span>
      {note && (
        <span className={cn('inline-flex items-center gap-1 text-small', trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground')}>
          {trend && <Trend aria-hidden className="size-3.5" strokeWidth={1.75} />}
          {note}
        </span>
      )}
    </div>
  );
}

const chartConfig = { views: { label: 'Lượt xem', color: 'var(--chart-1)' } } satisfies ChartConfig;

/** "dd/MM" for days, "T11" (or "T1/27" for January) for months. */
function tickLabel(date: string, granularity: ViewSeries['granularity']) {
  const [y, m, d] = date.split('-');
  if (granularity === 'month') return m === '01' ? `T1/${y.slice(2)}` : `T${Number(m)}`;
  return `${d}/${m}`;
}

/** "Lượt xem theo ngày / tháng" (board StudioDashboard): line chart (Recharts via shadcn chart), horizontal grid. */
export function ViewsChart({ series }: { series: ViewSeries }) {
  const data = series.points.map((p) => ({ ...p, label: tickLabel(p.date, series.granularity) }));
  const unit = series.granularity === 'month' ? 'tháng' : 'ngày';
  return (
    <section aria-labelledby="chart-h" className={cn(card, 'flex min-w-0 flex-[999_1_560px] flex-col gap-4 p-6')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="chart-h" className="font-serif text-[20px] leading-[26px] font-semibold">
          Lượt xem theo {unit}
        </h2>
        <span className="num text-label text-muted-foreground">Tổng {formatNumber(series.total)}</span>
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full" aria-label={`Biểu đồ lượt xem theo ${unit}, tổng ${formatNumber(series.total)}`}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} tickFormatter={(v: number) => formatCompact(v)} />
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-small shadow-raise">
                  <span className="font-semibold">{payload[0].payload.label}</span>: {formatNumber(Number(payload[0].value))} lượt
                </div>
              ) : null
            }
          />
          <Line dataKey="views" type="monotone" stroke="var(--color-views)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ChartContainer>
    </section>
  );
}

/** "Người theo dõi mới" (D4 recent): avatar, name, when. */
export function RecentFollowers({ followers }: { followers: Followers }) {
  return (
    <section aria-labelledby="fol-h" className={cn(card, 'flex min-w-0 flex-[1_1_280px] flex-col gap-3 p-6')}>
      <h2 id="fol-h" className="font-serif text-[20px] leading-[26px] font-semibold">
        Người theo dõi mới
      </h2>
      {followers.recent.length === 0 ? (
        <p className="text-label text-muted-foreground">Chưa có người theo dõi nào.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {followers.recent.map((f) => (
            <li key={f.userId} className="flex items-center gap-3">
              <UserAvatar name={f.displayName} avatarUrl={f.avatarUrl} size="nav" />
              <Link to={`/users/${f.username}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                {f.displayName}
              </Link>
              <span className="shrink-0 text-small text-muted-foreground">{formatRelative(f.followedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_120px_120px_100px_190px] lg:items-center lg:gap-4';

/** "Từng truyện" (D3): views, follows, rating, compared with my average. */
export function StoryStatsTable({ stories }: { stories: StoryStats[] }) {
  return (
    <section aria-labelledby="tbl-h" className={cn(card, 'overflow-hidden')}>
      <h2 id="tbl-h" className="px-6 pt-5 pb-3 font-serif text-[20px] leading-[26px] font-semibold">
        Từng truyện
      </h2>
      <div className={cn('bg-secondary px-6 py-2.5 text-small font-semibold text-muted-foreground max-lg:hidden', GRID)}>
        <span>Truyện</span>
        <span>Lượt xem</span>
        <span>Theo dõi</span>
        <span>Điểm</span>
        <span>So với trung bình</span>
      </div>
      <ul>
        {stories.map((s) => (
          <li key={s.storyId} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-6 py-3.5 text-label', GRID)}>
            <Link to={`/studio/stories/${s.storyId}`} className="min-w-0 truncate font-serif text-base font-semibold hover:text-primary max-lg:basis-full">
              {s.title}
            </Link>
            <span className="num inline-flex items-center gap-1.5" title={`${formatNumber(s.views30d)} lượt trong 30 ngày`}>
              <Eye aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
              {formatNumber(s.viewCount)}
            </span>
            <span className="num">
              {formatNumber(s.followCount)}
              <span className="lg:hidden"> theo dõi</span>
            </span>
            <span className="num inline-flex items-center gap-1">
              {s.ratingCount > 0 ? (
                <>
                  <Star aria-hidden className="size-3.5 fill-nghe text-nghe" strokeWidth={1.75} />
                  {formatRating(s.ratingAvg)}
                </>
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </span>
            <span>
              <Badge variant={s.ratingCount === 0 ? 'outline' : s.aboveMyAverage ? 'success' : 'warning'} className="rounded-full px-2.5 font-semibold">
                {s.ratingCount === 0 ? 'Chưa có đánh giá' : s.aboveMyAverage ? 'Cao hơn trung bình' : 'Thấp hơn trung bình'}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
