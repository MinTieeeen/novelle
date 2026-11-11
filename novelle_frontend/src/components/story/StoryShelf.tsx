import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StoryCard } from '@/components/story/StoryCard';
import type { StoryCard as StoryCardData } from '@/types/story';

interface SectionHeadingProps {
  id: string;
  title: ReactNode;
  /** "Xem tất cả" target */
  moreTo?: string;
  moreLabel?: string;
}

/** Block heading of the home page: title-2 serif + a "Xem tất cả" link on the right. */
export function SectionHeading({ id, title, moreTo, moreLabel = 'Xem tất cả' }: SectionHeadingProps) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-title-2 font-semibold">
        {title}
      </h2>
      {moreTo && (
        <Link to={moreTo} className="shrink-0 text-label font-medium text-link hover:underline">
          {moreLabel}
        </Link>
      )}
    </div>
  );
}

interface StoryShelfProps {
  id: string;
  title: string;
  stories: StoryCardData[];
  moreTo?: string;
  /** cards shown (the API returns up to 12) */
  limit?: number;
}

/**
 * Shelf of story cards (StoryShelf board): grid of 156px+ cards on desktop, horizontal scroller on
 * mobile. An empty shelf renders nothing.
 */
export function StoryShelf({ id, title, stories, moreTo, limit = 6 }: StoryShelfProps) {
  if (stories.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <SectionHeading id={id} title={title} moreTo={moreTo} />
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6 sm:gap-y-8 sm:overflow-visible sm:px-0">
        {stories.slice(0, limit).map((s) => (
          <StoryCard key={s.storyId} story={s} className="w-[140px] shrink-0 snap-start sm:w-auto" />
        ))}
      </div>
    </section>
  );
}
