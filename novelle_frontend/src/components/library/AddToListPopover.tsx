import { Check, Loader2, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ReadingListSummary } from '@/types/library';
import { formatNumber } from '@/utils/format';

interface AddToListPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** my lists; undefined while loading */
  lists?: ReadingListSummary[];
  error?: boolean;
  /** lists this story was added to during this visit (T1 does not say which lists hold a story) */
  addedTo: Set<number>;
  addingTo?: number | null;
  onAdd: (list: ReadingListSummary) => void;
  onCreate: () => void;
  /** replaces the trigger click for guests (opens the login popup instead) */
  onTriggerClick?: () => boolean;
}

/**
 * "Thêm vào tủ" (StoryHero board): popover with my lists (name, count, private lock); a click adds the
 * story, a check marks the lists it went to; "Tạo tủ mới" opens the list form.
 */
export function AddToListPopover({
  open,
  onOpenChange,
  lists,
  error,
  addedTo,
  addingTo,
  onAdd,
  onCreate,
  onTriggerClick,
}: AddToListPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 px-4 font-medium"
          onClick={(e) => {
            if (onTriggerClick?.()) e.preventDefault();
          }}
        >
          <Plus aria-hidden strokeWidth={1.75} className="size-4" />
          Thêm vào tủ
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] rounded-lg p-0" aria-label="Thêm vào tủ truyện">
        <p className="border-b border-border px-4 py-3 font-serif text-[17px] leading-6 font-semibold">Thêm vào tủ</p>
        <div className="max-h-[280px] overflow-y-auto py-1.5">
          {lists === undefined && !error && (
            <div className="flex flex-col gap-2.5 px-4 py-2" aria-label="Đang tải tủ truyện">
              <Skeleton className="h-5 w-3/4 bg-secondary" />
              <Skeleton className="h-5 w-1/2 bg-secondary" />
            </div>
          )}
          {error && <p className="px-4 py-3 text-label text-muted-foreground">Không tải được danh sách tủ.</p>}
          {lists?.length === 0 && <p className="px-4 py-3 text-label text-muted-foreground">Bạn chưa có tủ truyện nào.</p>}
          {lists && lists.length > 0 && (
            <ul>
              {lists.map((l) => {
                const added = addedTo.has(l.listId);
                const adding = addingTo === l.listId;
                return (
                  <li key={l.listId}>
                    <button
                      type="button"
                      onClick={() => onAdd(l)}
                      disabled={added || adding}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2 text-left text-label transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent',
                      )}
                    >
                      <span className="grid size-5 shrink-0 place-items-center">
                        {adding ? (
                          <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.75} />
                        ) : added ? (
                          <Check aria-hidden className="size-4 text-success" strokeWidth={2} />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                      {!l.isPublic && <Lock aria-label="Riêng tư" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
                      <span className="num shrink-0 text-caption text-muted-foreground">{formatNumber(l.itemCount)}</span>
                      {added && <span className="sr-only">(đã thêm)</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={onCreate}>
            <Plus aria-hidden strokeWidth={1.75} /> Tạo tủ mới
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
