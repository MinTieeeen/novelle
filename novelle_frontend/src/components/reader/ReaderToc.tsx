import { ChevronDown, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildTocGroups } from '@/components/story/tocGroups';
import { Skeleton } from '@/components/ui/skeleton';
import { keepOpenOnToast } from '@/lib/overlay';
import { cn } from '@/lib/utils';
import { chapterLabel, type StoryDetail } from '@/types/story';
import { focusRing } from './readerStyles';

interface ReaderTocProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the story TOC (GET /stories/{slug}); undefined while it loads */
  story?: Pick<StoryDetail, 'volumes' | 'looseChapters'>;
  /** the TOC request failed */
  error?: boolean;
  currentChapterId: number;
}

/**
 * "Mục lục" panel of the reader (board ChapterReader, panel Mục lục): a 340px dialog under the toolbar,
 * right aligned with the 1100px toolbar row, light scrim. Every volume is listed; the one holding the
 * current chapter is open and the current chapter (nghe ribbon) is scrolled into view.
 */
export function ReaderToc({ open, onOpenChange, story, error, currentChapterId }: ReaderTocProps) {
  // Opened from two places (toolbar, ChapterNav) without a Radix trigger: remember who opened it.
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(14_15_34/0.18)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={keepOpenOnToast()}
          onCloseAutoFocus={(e) => {
            const target = returnFocus.current;
            if (target?.isConnected) {
              e.preventDefault();
              // No scroll: the ChapterNav button sits at the end of the chapter.
              target.focus({ preventScroll: true });
            }
          }}
          // Start on the current chapter (scrolled into view by TocList) instead of the close button.
          onOpenAutoFocus={(e) => {
            const current = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-current="page"]');
            if (current) {
              e.preventDefault();
              current.focus({ preventScroll: true });
            }
          }}
          className="fixed top-16 right-[max(16px,calc(50%-534px))] z-50 flex max-h-[min(460px,calc(100dvh-88px))] w-[340px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-lg border border-border bg-card font-sans text-foreground shadow-overlay outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2"
        >
          <div className="flex items-center justify-between border-b border-border py-2 pr-2 pl-4">
            <DialogPrimitive.Title className="font-serif text-[17px] leading-6 font-semibold">Mục lục</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Đóng mục lục"
              className={cn('grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground', focusRing)}
            >
              <X aria-hidden className="size-5" strokeWidth={1.75} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {story ? (
              <TocList story={story} currentChapterId={currentChapterId} />
            ) : error ? (
              <p className="px-4 py-6 text-label text-muted-foreground">Không tải được mục lục. Thử mở lại sau.</p>
            ) : (
              <div className="flex flex-col gap-3 px-4 py-4" aria-label="Đang tải mục lục">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-5 bg-secondary" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
                ))}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TocList({ story, currentChapterId }: { story: Pick<StoryDetail, 'volumes' | 'looseChapters'>; currentChapterId: number }) {
  const groups = useMemo(() => buildTocGroups(story.volumes, story.looseChapters), [story]);
  const currentNo = useMemo(
    () => groups.flatMap((g) => g.chapters).find((c) => c.chapterId === currentChapterId)?.chapterNo,
    [groups, currentChapterId],
  );
  const [open, setOpen] = useState<Set<string>>(() => {
    const key = groups.find((g) => g.chapters.some((c) => c.chapterId === currentChapterId))?.key ?? groups[0]?.key;
    return new Set(key ? [key] : []);
  });

  const listRef = useRef<HTMLDivElement>(null);
  // Bring the current chapter into view once, when the panel opens.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });
  }, []);

  if (groups.length === 0) return <p className="px-4 py-6 text-label text-muted-foreground">Truyện chưa có chương nào.</p>;

  // A single group needs no toggle (board: plain heading above the list).
  const collapsible = groups.length > 1;

  return (
    <div ref={listRef} className="pb-2">
      {groups.map((g) => {
        const isOpen = !collapsible || open.has(g.key);
        const panelId = `reader-toc-${g.key}`;
        return (
          <section key={g.key}>
            {collapsible ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                className={cn(
                  'sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-card px-4 pt-2.5 pb-1 text-left text-small font-semibold text-muted-foreground hover:text-foreground',
                  focusRing,
                )}
              >
                <span className="min-w-0 truncate">{g.heading}</span>
                <ChevronDown aria-hidden strokeWidth={1.75} className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
              </button>
            ) : (
              <p className="px-4 pt-2.5 pb-1 text-small font-semibold text-muted-foreground">{g.heading}</p>
            )}
            {isOpen && (
              <ol id={panelId} className="px-2 pb-2">
                {g.chapters.map((c) => {
                  const current = c.chapterId === currentChapterId;
                  const read = !current && currentNo !== undefined && c.chapterNo < currentNo;
                  return (
                    <li key={c.chapterId}>
                      <Link
                        to={`/chapters/${c.chapterId}`}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'relative block truncate rounded-md py-2 pr-3 text-[14px] leading-[22px] transition-colors',
                          focusRing,
                          current ? 'bg-nghe-soft pl-8 font-semibold' : 'pl-3 hover:bg-secondary',
                          read && 'text-muted-foreground',
                        )}
                      >
                        {current && <span aria-hidden className="ribbon absolute top-0 left-3 h-[26px] w-2.5" />}
                        {chapterLabel(c)}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
