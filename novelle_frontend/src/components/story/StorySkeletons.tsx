import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Loading placeholders shaped like the real content (DS: skeleton, not a spinner). */

export function StoryCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden>
      <Skeleton className="aspect-[3/4] w-full rounded-cover" />
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function StoryGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div role="status" aria-label="Đang tải truyện" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))] sm:gap-x-6">
      {Array.from({ length: count }, (_, i) => (
        <StoryCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function StoryListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Đang tải truyện" className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:p-5">
          <Skeleton className="aspect-[3/4] w-full rounded-cover" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rows of UpdatedList / TopList. */
export function StoryRowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Đang tải" className="overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className={cn('flex items-center gap-4 px-4 py-3', i > 0 && 'border-t border-border')}>
          <Skeleton className="aspect-[3/4] w-10 shrink-0 rounded-cover" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoryDetailSkeleton() {
  return (
    <div role="status" aria-label="Đang tải truyện" className="flex flex-col gap-8 sm:flex-row sm:gap-10">
      <Skeleton className="mx-auto aspect-[3/4] w-[200px] shrink-0 rounded-cover sm:mx-0 sm:w-[240px]" />
      <div className="flex flex-1 flex-col gap-4" aria-hidden>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-4/5" />
        <Skeleton className="h-5 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-[30px] w-24 rounded-full" />
          <Skeleton className="h-[30px] w-20 rounded-full" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-11 w-36" />
      </div>
    </div>
  );
}
