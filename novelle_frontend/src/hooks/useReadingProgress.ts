import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { saveProgress, saveProgressOnLeave } from '@/api/reading';
import { queryKeys } from '@/api/queryKeys';
import { hasCode } from '@/utils/errors';
import { scrollPercentOf, shouldSaveProgress } from '@/utils/reading';

/** Wait this long after the last scroll before saving. */
export const PROGRESS_DEBOUNCE_MS = 2000;

/** Errors after which saving stops for this chapter (logged out, story or chapter gone). */
const STOP_CODES = ['UNAUTHENTICATED', 'STORY_NOT_FOUND', 'CHAPTER_NOT_FOUND', 'CHAPTER_NOT_IN_STORY', 'ACCOUNT_BANNED'];

interface Options {
  storyId: number | undefined;
  chapterId: number | undefined;
  /** the chapter body; the percentage is measured over this element */
  contentRef: RefObject<HTMLElement | null>;
  /** save to the backend (logged-in reader). The percentage is tracked either way for the progress bar. */
  save: boolean;
  /** the position the backend already has for this chapter (GET /chapters → myScrollPercent) */
  initialPercent?: number | null;
}

/**
 * Tracks how far the reader is through the chapter (0–100) and saves it: debounced 2 s, only when it
 * moved at least 1 point, a last save with fetch keepalive when the tab is hidden or closed, and a flush
 * when the chapter changes. 429 skips that save; 401 / not found stops saving.
 */
export function useReadingProgress({ storyId, chapterId, contentRef, save, initialPercent }: Options) {
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(0);
  const percentRef = useRef(0);
  const savedRef = useRef<number | null>(initialPercent ?? null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    savedRef.current = initialPercent ?? null;
    stoppedRef.current = false;
    // Reset when the chapter changes only; initialPercent arrives with the chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // Measure on scroll and resize (rAF throttled).
  useEffect(() => {
    if (chapterId === undefined) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = scrollPercentOf(window.scrollY, {
        top: rect.top + window.scrollY,
        height: rect.height,
        viewport: window.innerHeight,
      });
      percentRef.current = next;
      setPercent(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [chapterId, contentRef]);

  // Debounced save.
  useEffect(() => {
    if (!save || storyId === undefined || chapterId === undefined || stoppedRef.current) return;
    if (!shouldSaveProgress(savedRef.current, percent)) return;
    const timer = window.setTimeout(() => {
      const scrollPercent = percentRef.current;
      if (!shouldSaveProgress(savedRef.current, scrollPercent)) return;
      savedRef.current = scrollPercent;
      saveProgress(storyId, { chapterId, scrollPercent })
        .then((progress) => queryClient.setQueryData(queryKeys.readingProgress(storyId), progress))
        .catch((e: unknown) => {
          if (hasCode(e, ...STOP_CODES)) stoppedRef.current = true;
          // RATE_LIMITED or network: forget this save so the next scroll tries again.
          else savedRef.current = null;
        });
    }, PROGRESS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [save, storyId, chapterId, percent, queryClient]);

  // Last save when leaving: tab hidden / page closed (keepalive), or another chapter / page in the SPA.
  useEffect(() => {
    if (!save || storyId === undefined || chapterId === undefined) return;
    const flush = (keepalive: boolean) => {
      const scrollPercent = percentRef.current;
      if (stoppedRef.current || !shouldSaveProgress(savedRef.current, scrollPercent)) return;
      savedRef.current = scrollPercent;
      if (keepalive) saveProgressOnLeave(storyId, { chapterId, scrollPercent });
      else
        void saveProgress(storyId, { chapterId, scrollPercent })
          .then((progress) => queryClient.setQueryData(queryKeys.readingProgress(storyId), progress))
          .catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(false);
    };
  }, [save, storyId, chapterId, queryClient]);

  return percent;
}
