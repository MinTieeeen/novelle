import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReadingProgress } from '@/types/reading';

interface ContinueReadingButtonProps {
  progress: Pick<ReadingProgress, 'chapterId' | 'chapterNo' | 'chapterTitle' | 'scrollPercent'>;
  className?: string;
}

/**
 * "Đọc tiếp: Chương N" (DS ContinueReading, StoryHero): the nghe ribbon button, second line
 * "chapter title · 38%". The only place besides the reader where nghe marks the reading position.
 */
export function ContinueReadingButton({ progress, className }: ContinueReadingButtonProps) {
  const pct = Math.round(progress.scrollPercent);
  // Line 1 already says "Chương N": drop a "Chương N:" prefix stored in the title.
  const title = progress.chapterTitle.replace(/^chương\s*\d+\s*[:.\-–]\s*/i, '');
  return (
    <Button variant="continue" asChild className={cn('max-w-full', className)}>
      <Link to={`/chapters/${progress.chapterId}`}>
        <b className="text-body font-semibold">Đọc tiếp: Chương {progress.chapterNo}</b>
        <span className="max-w-full truncate text-small text-nghe-ink">
          {title}
          {pct > 0 && ` · ${pct}%`}
        </span>
      </Link>
    </Button>
  );
}
