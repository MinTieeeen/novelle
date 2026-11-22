import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '@/components/story/StoryShelf';
import { StoryCover } from '@/components/story/StoryCover';
import { cn } from '@/lib/utils';
import type { Genre, StoryCard } from '@/types/story';
import { formatNumber, formatRelative } from '@/utils/format';

/** "Mới cập nhật" (UpdatedList board): rows with a small cover, title, last chapter · genre, time. */
export function UpdatedList({ stories, moreTo }: { stories: StoryCard[]; moreTo?: string }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="h-updated" className="flex flex-col gap-4">
      <SectionHeading id="h-updated" title="Mới cập nhật" moreTo={moreTo} />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {stories.map((s, i) => (
          <Link
            key={s.storyId}
            to={`/stories/${s.slug}`}
            className={cn(
              'grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary',
              i > 0 && 'border-t border-border',
            )}
          >
            <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="xs" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{s.title}</span>
              <span className="truncate text-small text-muted-foreground">
                Chương {formatNumber(s.chapterCount)}
                {s.primaryGenre && ` · ${s.primaryGenre.name}`}
              </span>
            </span>
            <span className="text-small whitespace-nowrap text-muted-foreground">{formatRelative(s.lastChapterAt)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const MEDALS = [
  { cls: 'bg-medal-gold text-medal-gold-ink ring-medal-gold-ring', label: 'Hạng nhất, huy chương vàng' },
  { cls: 'bg-medal-silver text-medal-silver-ink ring-medal-silver-ring', label: 'Hạng nhì, huy chương bạc' },
  { cls: 'bg-medal-bronze text-medal-bronze-ink ring-medal-bronze-ring', label: 'Hạng ba, huy chương đồng' },
];

/** "Xem nhiều nhất" (TopList board): ranked list, medals for 1–3, view counts. */
export function TopList({ stories, moreTo }: { stories: StoryCard[]; moreTo?: string }) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby="h-top" className="flex flex-col gap-4">
      <SectionHeading id="h-top" title="Xem nhiều nhất" moreTo={moreTo} />
      <ol className="overflow-hidden rounded-lg border border-border bg-card">
        {stories.map((s, i) => {
          const medal = MEDALS[i];
          return (
            <li key={s.storyId} className={cn(i > 0 && 'border-t border-border')}>
              <Link
                to={`/stories/${s.slug}`}
                className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary"
              >
                {medal ? (
                  <span
                    aria-label={medal.label}
                    className={cn('grid size-7 place-items-center rounded-full text-[13px] font-bold ring-2 ring-inset', medal.cls)}
                  >
                    {i + 1}
                  </span>
                ) : (
                  <span className="text-center font-serif text-xl leading-6 font-semibold text-input italic">{i + 1}</span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className={cn('truncate', medal ? 'font-semibold' : 'font-medium')}>{s.title}</span>
                  <span
                    aria-label={`${formatNumber(s.viewCount)} lượt xem`}
                    className="num inline-flex items-center gap-1.5 text-small text-muted-foreground"
                  >
                    <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
                    {formatNumber(s.viewCount)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "Thể loại" grid at the bottom of the home page (GenreGrid board). */
export function GenreGrid({ genres }: { genres: Genre[] }) {
  if (genres.length === 0) return null;
  return (
    <section aria-labelledby="h-genres" className="flex flex-col gap-4">
      <SectionHeading id="h-genres" title="Thể loại" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {genres.map((g) => (
          <Link
            key={g.genreId}
            to={`/search?genres=${g.slug}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 font-medium transition-colors hover:border-input hover:text-primary"
          >
            <span className="truncate">{g.name}</span>
            <span className="num text-small font-normal text-muted-foreground">{formatNumber(g.storyCount)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
