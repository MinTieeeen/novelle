import { BookOpen, Eye, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AgeBadge, GenreBadge, StatusBadge } from '@/components/story/StoryBadges';
import { RatingStars } from '@/components/story/RatingStars';
import { StoryCover } from '@/components/story/StoryCover';
import type { StoryCard } from '@/types/story';
import { formatCompact, formatNumber, formatRelative } from '@/utils/format';

/**
 * Result row (StoryListItem board, `view=list`): cover, title + update time, author · genre · status ·
 * 18+, two-line description, rating, chapters, views, follows.
 */
export function StoryListItem({ story }: { story: StoryCard }) {
  const to = `/stories/${story.slug}`;
  return (
    <article className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-5 sm:p-5">
      <Link to={to} aria-label={story.title} tabIndex={-1}>
        <StoryCover
          storyId={story.storyId}
          title={story.title}
          penName={story.author.penName}
          coverUrl={story.coverUrl}
          size="sm"
          className="w-full"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="min-w-0 font-serif text-title-3 font-semibold">
            <Link to={to} className="hover:text-primary">
              {story.title}
            </Link>
          </h3>
          {story.lastChapterAt && (
            <span className="text-small whitespace-nowrap text-muted-foreground">Cập nhật {formatRelative(story.lastChapterAt)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-label">
          <Link to={`/authors/${story.author.authorId}`} className="font-medium text-link hover:underline">
            {story.author.penName}
          </Link>
          <span aria-hidden className="text-input">
            ·
          </span>
          {story.primaryGenre && <GenreBadge name={story.primaryGenre.name} />}
          <StatusBadge status={story.completionStatus} />
          <AgeBadge ageRating={story.ageRating} />
        </div>
        {story.description && <p className="line-clamp-2 text-label leading-[22px] text-muted-foreground">{story.description}</p>}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-small text-muted-foreground">
          <RatingStars value={story.ratingAvg} count={story.ratingCount} />
          <span aria-label={`${formatNumber(story.chapterCount)} chương`} className="num inline-flex items-center gap-1">
            <BookOpen aria-hidden className="size-3.5" strokeWidth={1.75} />
            {formatNumber(story.chapterCount)} chương
          </span>
          <span aria-label={`${formatNumber(story.viewCount)} lượt xem`} className="num inline-flex items-center gap-1">
            <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
            {formatCompact(story.viewCount)}
          </span>
          <span aria-label={`${formatNumber(story.followCount)} người theo dõi`} className="num inline-flex items-center gap-1">
            <Heart aria-hidden className="size-3.5" strokeWidth={1.75} />
            {formatCompact(story.followCount)}
          </span>
        </div>
      </div>
    </article>
  );
}
