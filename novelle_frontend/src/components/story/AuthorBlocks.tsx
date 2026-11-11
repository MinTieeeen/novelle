import { Check, Eye, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '@/components/common/UserAvatar';
import { StoryCover } from '@/components/story/StoryCover';
import type { AuthorProfile, StoryCard } from '@/types/story';
import { formatCompact, formatMonthYear, formatNumber, formatRating } from '@/utils/format';

/**
 * Top of the author page (AuthorHeader board): 112px avatar with the verified tick, pen name,
 * "Tham gia từ tháng 3/2026", bio, five stats. `actionSlot` takes the follow button (FE4).
 */
export function AuthorHeader({ author, actionSlot }: { author: AuthorProfile; actionSlot?: ReactNode }) {
  const stats: { label: string; value: ReactNode }[] = [
    { label: 'Người theo dõi', value: formatNumber(author.followerCount) },
    { label: 'Truyện', value: formatNumber(author.stats.storyCount) },
    { label: 'Chương', value: formatNumber(author.stats.chapterCount) },
    { label: 'Lượt xem', value: formatNumber(author.stats.viewCount) },
    {
      label: 'Điểm trung bình',
      value:
        author.stats.ratingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Star aria-hidden className="size-5 fill-nghe text-nghe" strokeWidth={1.75} />
            {formatRating(author.stats.ratingAvg)}
          </span>
        ) : (
          '–'
        ),
    },
  ];

  return (
    <section
      aria-labelledby="author-name"
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-start sm:gap-8 sm:p-8"
    >
      <UserAvatar name={author.penName} avatarUrl={author.avatarUrl} size="xl" verified={author.isVerified} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 id="author-name" className="text-[30px] leading-9 font-[620] tracking-[-0.01em] sm:text-[36px] sm:leading-[42px]">
              {author.penName}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-label text-muted-foreground">
              {author.isVerified && (
                <span
                  role="img"
                  aria-label="Tác giả đã xác minh"
                  className="grid size-[18px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
              )}
              Tham gia từ {formatMonthYear(author.authorSince)}
            </p>
          </div>
          {actionSlot}
        </div>
        {author.bio && <p className="max-w-reading font-serif text-base leading-7 whitespace-pre-line">{author.bio}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-small text-muted-foreground">{s.label}</dt>
              <dd className="num font-serif text-[22px] leading-7 font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** "Cùng tác giả" aside of the story page (StoryDetail board). Renders nothing without other stories. */
export function SameAuthorList({ stories, authorId, penName }: { stories: StoryCard[]; authorId: number; penName: string }) {
  if (stories.length === 0) return null;
  return (
    <aside aria-labelledby="same-author" className="flex flex-col gap-4">
      <h2 id="same-author" className="text-title-3 font-semibold">
        Cùng tác giả
      </h2>
      <ul className="flex flex-col gap-3">
        {stories.map((s) => (
          <li key={s.storyId}>
            <Link to={`/stories/${s.slug}`} className="group grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3">
              <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="xs" className="w-12" />
              <span className="flex min-w-0 flex-col">
                <span className="line-clamp-2 font-semibold group-hover:text-primary">{s.title}</span>
                <span className="flex gap-3 text-small text-muted-foreground">
                  <span className="num">{formatNumber(s.chapterCount)} chương</span>
                  <span className="num inline-flex items-center gap-1" aria-label={`${formatNumber(s.viewCount)} lượt xem`}>
                    <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
                    {formatCompact(s.viewCount)}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/authors/${authorId}`} className="text-label font-medium text-link hover:underline">
        Xem trang của {penName}
      </Link>
    </aside>
  );
}
