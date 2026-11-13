import { ChevronLeft, ChevronRight, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/types/story';
import { focusRing } from './readerStyles';

export interface NavTarget {
  chapterId: number;
  /** from the story TOC; without them the button says "Chương trước" / "Chương sau" */
  chapterNo?: number;
  title?: string;
}

interface ChapterNavProps {
  prev?: NavTarget | null;
  next?: NavTarget | null;
  onToc: () => void;
}

const base = cn(
  'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-label transition-colors sm:max-w-[300px] sm:gap-2 sm:px-4',
  focusRing,
);

function fullLabel(target: NavTarget, fallback: string) {
  return target.title && target.chapterNo !== undefined
    ? chapterLabel({ chapterNo: target.chapterNo, title: target.title })
    : fallback;
}

/**
 * Previous · TOC · next (board ChapterNav). "Next" is the primary action of the reading surface; at the
 * first or last chapter the matching button is shown disabled. Chapter titles from sm, short labels below.
 */
export function ChapterNav({ prev, next, onToc }: ChapterNavProps) {
  return (
    <nav aria-label="Chuyển chương" className="flex items-stretch justify-center gap-3 font-sans text-reader-ink">
      {prev ? (
        <Link
          to={`/chapters/${prev.chapterId}`}
          rel="prev"
          aria-label={`Chương trước: ${fullLabel(prev, 'Chương trước')}`}
          className={cn(base, 'sm:justify-start border border-reader-line hover:bg-reader-hover')}
        >
          <ChevronLeft aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
          <span className="truncate font-medium max-sm:hidden">{fullLabel(prev, 'Chương trước')}</span>
          <span className="truncate font-medium sm:hidden">Trước</span>
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(base, 'sm:justify-start border border-reader-line opacity-45')}>
          <ChevronLeft aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
          <span className="truncate font-medium max-sm:hidden">Chương trước</span>
          <span className="truncate font-medium sm:hidden">Trước</span>
        </span>
      )}
      <button
        type="button"
        onClick={onToc}
        aria-label="Mục lục"
        aria-haspopup="dialog"
        className={cn('grid w-[52px] flex-none place-items-center rounded-md border border-reader-line transition-colors hover:bg-reader-hover', focusRing)}
      >
        <List aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>
      {next ? (
        <Link
          to={`/chapters/${next.chapterId}`}
          rel="next"
          aria-label={`Chương sau: ${fullLabel(next, 'Chương sau')}`}
          className={cn(base, 'sm:justify-end bg-reader-accent text-reader-accent-ink hover:opacity-90')}
        >
          <span className="truncate font-semibold max-sm:hidden">{fullLabel(next, 'Chương sau')}</span>
          <span className="truncate font-semibold sm:hidden">Sau</span>
          <ChevronRight aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(base, 'sm:justify-end bg-reader-accent text-reader-accent-ink opacity-35')}>
          <span className="truncate font-semibold max-sm:hidden">Chương sau</span>
          <span className="truncate font-semibold sm:hidden">Sau</span>
          <ChevronRight aria-hidden className="size-4 flex-none" strokeWidth={1.75} />
        </span>
      )}
    </nav>
  );
}
