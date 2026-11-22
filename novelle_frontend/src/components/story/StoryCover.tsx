import { useState } from 'react';
import { cn } from '@/lib/utils';

/** The five cover tones of the boards (Main, StoryCard), picked by `storyId % 5`. */
const TONES = [
  'bg-primary text-primary-foreground',
  'bg-accent text-accent-foreground',
  'bg-foreground text-background',
  'bg-link text-primary-foreground',
  'bg-nghe-soft text-reader-sepia-ink',
] as const;

const SIZES = {
  /** list rows (UpdatedList, TopList, SameAuthorList): no text */
  xs: { box: 'w-10', spine: 'w-[3px]', ribbon: '', title: '', author: '', pad: '' },
  /** StoryListItem (96px) */
  sm: { box: 'w-24', spine: 'w-[5px]', ribbon: 'right-2.5 h-[26px] w-2', title: 'text-[12px] leading-[15px] pr-3', author: 'hidden', pad: 'pt-2.5 pr-2 pb-2 pl-3' },
  /** StoryCard (grid) */
  md: { box: 'w-full', spine: 'w-1.5', ribbon: 'right-3.5 h-9 w-2.5', title: 'text-[18px] leading-[22px] pr-[18px]', author: 'text-[11px] leading-[14px]', pad: 'pt-3.5 pr-3.5 pb-3 pl-5' },
  /** StoryHero (240px) */
  lg: { box: 'w-full', spine: 'w-2', ribbon: 'right-[22px] h-16 w-4', title: 'text-[24px] leading-7 pr-7 sm:text-[28px] sm:leading-8', author: 'text-small', pad: 'pt-6 pr-[22px] pb-5 pl-[30px]' },
} as const;

interface StoryCoverProps {
  storyId: number;
  title: string;
  penName?: string;
  coverUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Story cover drawn as a book (DS Cover): 3:4, near-square corners, spine on the left, its own shadow.
 * With an image the title and author are not printed on it (the image has no text, data-dictionary §9.6
 * draws them with CSS on top); without one — or when the image fails to load — the default cover:
 * title in italic Literata, pen name at the bottom, nghe ribbon top right, tone by storyId.
 */
export function StoryCover({ storyId, title, penName, coverUrl, size = 'md', className }: StoryCoverProps) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];
  const showImage = !!coverUrl && !failed;
  const tone = TONES[Math.abs(storyId) % TONES.length];

  return (
    <span
      aria-hidden
      className={cn(
        'book-cover relative flex aspect-[3/4] shrink-0 flex-col justify-between',
        s.box,
        !showImage && tone,
        !showImage && s.pad,
        className,
      )}
    >
      {showImage ? (
        <img
          src={coverUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        size !== 'xs' && (
          <>
            <span className={cn('ribbon absolute top-0', s.ribbon)} />
            <span className={cn('font-serif font-semibold italic', size === 'lg' ? 'line-clamp-6' : 'line-clamp-4', s.title)}>{title}</span>
            {penName && <span className={cn('truncate font-medium opacity-85', s.author)}>{penName}</span>}
          </>
        )
      )}
      <span className={cn('absolute inset-y-0 left-0 bg-black/18', s.spine)} />
    </span>
  );
}
