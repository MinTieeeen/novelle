import { ArrowDown, ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { StoryCover } from '@/components/story/StoryCover';
import { cn } from '@/lib/utils';
import { focusRing } from './readerStyles';

interface StorySplashProps {
  story: { storyId: number; title: string; penName: string; coverUrl?: string | null };
  /** "Tập 1 · Chương 1: Người gác đèn" */
  chapterLine: string;
  /** scroll to the chapter text */
  onStart: () => void;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]');
}

/**
 * Full-screen cover shown above the first chapter (FE3 decision 5): large cover, title, pen name, the
 * chapter line and "Bắt đầu đọc". Not part of the reading percentage. While it fills the window, ↓,
 * Space and Enter also start reading.
 */
export function StorySplash({ story, chapterLine, onStart }: StorySplashProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTyping(e.target)) return;
      if (!['ArrowDown', ' ', 'Enter'].includes(e.key)) return;
      // Enter on a focused control keeps its own meaning (links, buttons).
      if (e.key === 'Enter' && e.target !== document.body) return;
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.bottom < window.innerHeight * 0.6) return;
      e.preventDefault();
      onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  return (
    <section
      ref={ref}
      aria-label="Bìa truyện"
      className="relative flex min-h-[calc(100dvh-59px)] flex-col items-center justify-center gap-7 px-6 py-12 text-center font-sans"
    >
      <StoryCover
        storyId={story.storyId}
        title={story.title}
        penName={story.penName}
        coverUrl={story.coverUrl}
        size="lg"
        className="w-[180px] sm:w-[240px]"
      />
      <div className="flex max-w-[640px] flex-col items-center gap-2">
        <h2 className="font-serif text-[30px] leading-[38px] font-[620] text-balance sm:text-[44px] sm:leading-[54px]">{story.title}</h2>
        <p className="mt-1 text-body text-reader-muted">{story.penName}</p>
        <p className="mt-2 font-serif text-[17px] leading-6 italic">{chapterLine}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className={cn(
          'inline-flex h-11 items-center gap-2 rounded-md bg-reader-accent px-6 text-label font-semibold text-reader-accent-ink transition-opacity hover:opacity-90',
          focusRing,
        )}
      >
        Bắt đầu đọc
        <ArrowDown aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
      <ChevronDown
        aria-hidden
        strokeWidth={1.5}
        className="absolute bottom-6 size-6 text-reader-muted motion-safe:animate-bounce"
      />
    </section>
  );
}
