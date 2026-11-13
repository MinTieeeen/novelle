import { BadgeCheck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { UserAvatar } from '@/components/common/UserAvatar';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { perStory, vsAverage, type GenreStat, type TopAuthors, type UserGrowth } from '@/types/admin';
import { formatCompact, formatNumber } from '@/utils/format';

const card = 'rounded-lg border border-border bg-card';

export type GenreMetric = 'stories' | 'views';

/** "Theo thể loại" (board AdminDashboard): horizontal bars, Truyện / Lượt xem toggle, all time. */
export function GenreBars({
  genres,
  metric,
  onMetric,
}: {
  genres: GenreStat[];
  metric: GenreMetric;
  onMetric: (m: GenreMetric) => void;
}) {
  const value = (g: GenreStat) => (metric === 'stories' ? g.storyCount : g.totalViews);
  const rows = [...genres].sort((a, b) => value(b) - value(a)).slice(0, 10);
  const max = Math.max(1, ...rows.map(value));
  return (
    <section aria-labelledby="g-h" className={cn(card, 'flex min-w-0 flex-[1_1_340px] flex-col gap-4 p-6')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="g-h" className="font-serif text-[20px] leading-[26px] font-semibold">
            Theo thể loại
          </h2>
          <p className="text-small text-muted-foreground">Toàn thời gian</p>
        </div>
        <div role="group" aria-label="Chỉ số" className="inline-flex rounded-[10px] bg-secondary p-[3px]">
          {(
            [
              ['stories', 'Truyện'],
              ['views', 'Lượt xem'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => onMetric(m)}
              className={cn(
                'h-8 rounded-md px-3 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid',
                metric === m
                  ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((g) => (
          <li
            key={g.genreId}
            className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-label"
          >
            <span className="truncate">{g.name}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(value(g) / max) * 100}%` }}
              />
            </span>
            <span className="text-right text-muted-foreground num">
              {metric === 'stories' ? formatNumber(value(g)) : formatCompact(value(g))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const growthConfig = {
  READER: { label: 'Người đọc', color: 'var(--chart-1)' },
  AUTHOR: { label: 'Tác giả', color: 'var(--chart-2)' },
  ADMIN: { label: 'Admin', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** "Người dùng mới theo tháng" (S4): stacked columns by role, 12 months. */
export function UserGrowthChart({ growth }: { growth: UserGrowth }) {
  const data = growth.months.map((m) => {
    const [y, mo] = m.month.split('-');
    return {
      label: mo === '01' ? `T1/${y.slice(2)}` : `T${Number(mo)}`,
      READER: m.byRole.READER ?? 0,
      AUTHOR: m.byRole.AUTHOR ?? 0,
      ADMIN: m.byRole.ADMIN ?? 0,
      total: m.total,
    };
  });
  const total = data.reduce((a, d) => a + d.total, 0);
  return (
    <section aria-labelledby="u-h" className={cn(card, 'flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-6')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="u-h" className="font-serif text-[20px] leading-[26px] font-semibold">
          Người dùng mới theo tháng
        </h2>
        <span className="text-small text-muted-foreground">12 tháng gần nhất · {formatNumber(total)}</span>
      </div>
      <ChartContainer
        config={growthConfig}
        className="aspect-auto h-[240px] w-full"
        aria-label={`Biểu đồ người dùng mới theo tháng, tổng ${formatNumber(total)}`}
      >
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            fontSize={11}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <ChartTooltip
            cursor={{ fill: 'var(--secondary)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-small shadow-raise">
                  <div className="font-semibold">
                    {payload[0].payload.label}: {formatNumber(payload[0].payload.total)}
                  </div>
                  {payload.map((p) => (
                    <div key={String(p.dataKey)} className="text-muted-foreground">
                      {growthConfig[p.dataKey as keyof typeof growthConfig].label}:{' '}
                      {formatNumber(Number(p.value))}
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="READER" stackId="u" fill="var(--color-READER)" />
          <Bar dataKey="AUTHOR" stackId="u" fill="var(--color-AUTHOR)" />
          <Bar dataKey="ADMIN" stackId="u" fill="var(--color-ADMIN)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <ul className="flex gap-4 text-small text-muted-foreground" aria-label="Chú thích">
        {Object.entries(growthConfig).map(([k, c]) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Tác giả vượt trung bình" (S5): views per story against the system average. */
export function TopAuthorsTable({ top }: { top: TopAuthors }) {
  const rows = top.items
    .map((a) => ({ ...a, per: perStory(a.totalViews, a.storyCount) }))
    .map((a) => ({ ...a, ratio: vsAverage(a.per, top.systemAverageViews) }))
    .sort((a, b) => b.per - a.per);
  return (
    <section
      aria-labelledby="a-h"
      className={cn(card, 'flex min-w-0 flex-[1_1_420px] flex-col overflow-hidden')}
    >
      <div className="px-4 pt-5 pb-3 sm:px-6">
        <h2 id="a-h" className="font-serif text-[20px] leading-[26px] font-semibold">
          Tác giả vượt trung bình
        </h2>
        <p className="text-small text-muted-foreground">
          Lượt xem mỗi truyện so với trung bình hệ thống ({formatNumber(Math.round(top.systemAverageViews))})
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_80px_64px] gap-3 bg-secondary px-4 py-2.5 text-small font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_64px_96px_96px] sm:px-6">
        <span>Tác giả</span>
        <span className="max-sm:hidden">Truyện</span>
        <span>Xem/truyện</span>
        <span>So với TB</span>
      </div>
      <ul>
        {rows.map((a) => (
          <li
            key={a.authorId}
            className="grid grid-cols-[minmax(0,1fr)_80px_64px] items-center gap-3 border-t border-border px-4 py-3 text-label sm:grid-cols-[minmax(0,1fr)_64px_96px_96px] sm:px-6"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <UserAvatar name={a.penName} size="sm" />
              <span className="truncate font-medium">{a.penName}</span>
              {a.isVerified && (
                <BadgeCheck
                  aria-label="đã xác minh"
                  className="size-3.5 shrink-0 text-primary"
                  strokeWidth={1.75}
                />
              )}
            </span>
            <span className="num max-sm:hidden">{formatNumber(a.storyCount)}</span>
            <span className="num">{formatNumber(a.per)}</span>
            <span>
              {a.ratio != null && (
                <span
                  className={cn(
                    'inline-flex h-6 items-center rounded-full px-2.5 text-small font-semibold num',
                    a.ratio >= 1 ? 'bg-success-soft text-success' : 'bg-secondary text-muted-foreground',
                  )}
                >
                  ×{a.ratio.toLocaleString('vi-VN')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
