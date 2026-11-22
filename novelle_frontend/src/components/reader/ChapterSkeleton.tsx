import { Skeleton } from '@/components/ui/skeleton';

const LINES = [100, 96, 98, 72, 100, 94, 99, 60, 97, 100, 88];

/** Loading state of the reader: volume line, title, meta and paragraph lines on the reading surface. */
export function ChapterSkeleton() {
  return (
    <div className="mx-auto max-w-reading" aria-busy="true" aria-label="Đang tải chương">
      <Skeleton className="mb-3 h-4 w-40 bg-reader-hover" />
      <Skeleton className="mb-4 h-9 w-4/5 bg-reader-hover" />
      <Skeleton className="mb-12 h-4 w-56 bg-reader-hover" />
      <div className="flex flex-col gap-3.5">
        {LINES.map((w, i) => (
          <Skeleton key={i} className="h-[18px] bg-reader-hover" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
