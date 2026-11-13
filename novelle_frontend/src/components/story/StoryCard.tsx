import { BookOpen, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RatingStars } from '@/components/story/RatingStars';
import { StoryCover } from '@/components/story/StoryCover';
import { cn } from '@/lib/utils';
import type { StoryCard as StoryCardData } from '@/types/story';
import { formatCompact, formatNumber } from '@/utils/format';

/**
 * Grid card (StoryCard board): book cover, title (2 lines, Literata), pen name + views, rating +
 * chapter count or "Hoàn thành". The whole card links to the story; hover changes the title colour only.
 */
export function StoryCard({ story, className }: { story: StoryCardData; className?: string }) {
  return (
    <Link to={`/stories/${story.slug}`} className={cn('group flex min-w-0 flex-col gap-3 text-foreground', className)}>
      <StoryCover storyId={story.storyId} title={story.title} penName={story.author.penName} coverUrl={story.coverUrl} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 font-serif text-[17px] leading-[22px] font-semibold transition-colors group-hover:text-primary">
          {story.title}
        </span>
        <span className="flex items-center justify-between gap-2 text-small text-muted-foreground">
          <span className="truncate">{story.author.penName}</span>
          <span aria-label={`${formatNumber(story.viewCount)} lượt xem`} className="num inline-flex shrink-0 items-center gap-1">
            <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
            {formatCompact(story.viewCount)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2 text-small text-muted-foreground">
          {story.ratingCount > 0 ? <RatingStars value={story.ratingAvg} /> : <span />}
          <span className="num inline-flex shrink-0 items-center gap-1">
            {story.completionStatus === 'COMPLETED' ? (
              'Hoàn thành'
            ) : (
              <>
                <BookOpen aria-hidden className="size-3.5" strokeWidth={1.75} />
                {formatNumber(story.chapterCount)} chương
              </>
            )}
          </span>
        </span>
      </span>
    </Link>
  );
}
