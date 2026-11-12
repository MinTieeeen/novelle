import { Link } from 'react-router-dom';
import { StoryCover } from '@/components/story/StoryCover';
import type { HistoryItem } from '@/types/library';
import { chapterLabel } from '@/types/story';
import { formatNumber } from '@/utils/format';

/**
 * "Đọc tiếp" card of the home page (board ContinueCard): nghe-soft card with the ribbon, small cover,
 * title, the chapter being read and "Đã đọc N / M chương". Opens that chapter (or the story when the
 * chapter is no longer public).
 */
export function ContinueCard({ item }: { item: HistoryItem }) {
  const { story, lastChapter } = item;
  return (
    <Link
      to={lastChapter ? `/chapters/${lastChapter.chapterId}` : `/stories/${story.slug}`}
      className="relative grid grid-cols-[56px_minmax(0,1fr)] gap-4 rounded-lg bg-nghe-soft py-4 pr-4 pl-11 text-foreground transition-shadow hover:shadow-raise focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <span aria-hidden className="ribbon absolute top-0 left-4 h-11 w-3.5" />
      <StoryCover storyId={story.storyId} title={story.title} coverUrl={story.coverUrl} size="xs" className="w-14" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-serif text-[17px] leading-[22px] font-semibold">{story.title}</span>
        <span className="truncate text-small text-nghe-ink">{lastChapter ? chapterLabel(lastChapter) : 'Chương đã bị gỡ'}</span>
        {lastChapter && (
          <span className="mt-1.5 text-small text-muted-foreground">
            Đã đọc <b className="font-semibold text-foreground">{formatNumber(lastChapter.chapterNo)}</b> /{' '}
            {formatNumber(story.chapterCount)} chương
          </span>
        )}
      </span>
    </Link>
  );
}
