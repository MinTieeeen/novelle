import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { queryKeys } from '@/api/queryKeys';
import { getChapter } from '@/api/reading';
import { getStory } from '@/api/stories';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/brand/Logo';
import { ErrorResult } from '@/components/common/ErrorResult';
import { ChapterArticle } from '@/components/reader/ChapterArticle';
import { ChapterNav, type NavTarget } from '@/components/reader/ChapterNav';
import { ChapterSkeleton } from '@/components/reader/ChapterSkeleton';
import { ReaderSettingsMenu } from '@/components/reader/ReaderSettingsPanel';
import { ReaderToc } from '@/components/reader/ReaderToc';
import { ReaderToolbar } from '@/components/reader/ReaderToolbar';
import { StorySplash } from '@/components/reader/StorySplash';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import { useReaderSettings } from '@/hooks/useReaderSettings';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import type { ReadingProgress } from '@/types/reading';
import { chapterLabel, type StoryDetail } from '@/types/story';
import { hasCode } from '@/utils/errors';
import { scrollYFor } from '@/utils/reading';

/** Height of the sticky toolbar (56px row + 3px progress bar). */
const TOOLBAR_HEIGHT = 59;

function parseId(raw: string | undefined): number | null {
  return raw && /^\d{1,18}$/.test(raw) ? Number(raw) : null;
}

function navTarget(story: StoryDetail | undefined, chapterId: number | null | undefined): NavTarget | null {
  if (chapterId == null) return null;
  const c = story && [...story.volumes.flatMap((v) => v.chapters), ...story.looseChapters].find((x) => x.chapterId === chapterId);
  return c ? { chapterId, chapterNo: c.chapterNo, title: c.title } : { chapterId };
}

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/**
 * R6 · Chapter reader (/chapters/:chapterId, board ChapterReader). Full screen on the reading surface:
 * toolbar (hides on scroll down), chapter, prev/next, TOC panel and reading settings. The first chapter
 * opens on the story splash. A logged-in reader's position is restored and saved (useReadingProgress).
 * Keys: ← / → previous / next chapter.
 *
 * GET /chapters/{id} counts a view and moves the reading position, so it is never prefetched and stays
 * cached for the session (staleTime Infinity).
 */
export default function ReaderPage() {
  const chapterId = parseId(useParams().chapterId);
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const { settings, update, readerProps } = useReaderSettings();

  const chapter = useQuery({
    queryKey: queryKeys.chapters.detail(chapterId ?? 0),
    queryFn: () => getChapter(chapterId!),
    // Wait for the session: a logged-in read returns myScrollPercent and moves the position.
    enabled: chapterId !== null && status !== 'loading',
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (count, e) => count < 1 && !hasCode(e, 'CHAPTER_NOT_FOUND', 'NOT_FOUND'),
  });
  const c = chapter.data;

  const story = useQuery({
    queryKey: queryKeys.stories.detail(c?.story.slug ?? ''),
    queryFn: () => getStory(c!.story.slug),
    enabled: !!c,
    staleTime: 5 * 60_000,
  });

  // The backend moved the reading position to this chapter: the story page must reload it.
  useEffect(() => {
    if (c && user) void queryClient.invalidateQueries({ queryKey: queryKeys.readingProgress(c.story.storyId) });
  }, [c, user, queryClient]);

  // Where to start: the latest save of this session for this chapter, else the backend's value.
  const startPercent = useMemo(() => {
    if (!c || !user) return null;
    const saved = queryClient.getQueryData<ReadingProgress | null>(queryKeys.readingProgress(c.story.storyId));
    if (saved && saved.chapterId === c.chapterId) return saved.scrollPercent;
    return c.myScrollPercent ?? 0;
  }, [c, user, queryClient]);

  const contentRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const progress = useReadingProgress({
    storyId: c?.story.storyId,
    chapterId: c?.chapterId,
    contentRef,
    save: !!user,
    initialPercent: startPercent,
  });

  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { hidden: scrolledDown, reveal } = useHideOnScroll();

  const showSplash = !!c && !c.prevChapterId && (startPercent ?? 0) < 1;

  // On every chapter: close the panels, then go to the saved position or the top.
  useLayoutEffect(() => {
    if (!c) return;
    setTocOpen(false);
    setSettingsOpen(false);
    const el = contentRef.current;
    if (el && startPercent !== null && startPercent >= 1) {
      // Same geometry as useReadingProgress measures with.
      const rect = el.getBoundingClientRect();
      window.scrollTo({
        top: scrollYFor(startPercent, { top: rect.top + window.scrollY, height: rect.height, viewport: window.innerHeight }),
      });
    } else {
      window.scrollTo({ top: 0 });
    }
    reveal();
    // Run once per chapter, when its text is in the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.chapterId]);

  const startReading = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    window.scrollTo({ top: main.getBoundingClientRect().top + window.scrollY - TOOLBAR_HEIGHT, behavior: smooth() });
    main.focus({ preventScroll: true });
  }, []);

  useDocumentTitle(c ? `${chapterLabel(c)} · ${c.story.title}` : undefined);

  // ← → change chapter, except while typing, with a modifier or with a panel / dialog open.
  const navigate = useNavigate();
  const panelOpen = tocOpen || settingsOpen;
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || panelOpen) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="radiogroup"]')) return;
      const id = e.key === 'ArrowLeft' ? c.prevChapterId : e.key === 'ArrowRight' ? c.nextChapterId : undefined;
      if (id == null) return;
      e.preventDefault();
      navigate(`/chapters/${id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c, panelOpen, navigate]);

  const prev = useMemo(() => navTarget(story.data, c?.prevChapterId), [story.data, c?.prevChapterId]);
  const next = useMemo(() => navTarget(story.data, c?.nextChapterId), [story.data, c?.nextChapterId]);
  const firstLine = useMemo(() => {
    if (!c) return '';
    return [c.volume && `Tập ${c.volume.volumeNo}`, chapterLabel(c)].filter(Boolean).join(' · ');
  }, [c]);
  const coverUrl = story.data?.coverUrl;

  if (chapterId === null || (chapter.isError && hasCode(chapter.error, 'CHAPTER_NOT_FOUND', 'NOT_FOUND'))) {
    return (
      <ReaderMessage>
        <ErrorResult
          variant="not-found"
          title="Chương không tồn tại hoặc chưa được đăng"
          description="Chương có thể đã bị gỡ, đang chờ đăng, hoặc đường dẫn đã đổi."
          action={
            <Button asChild>
              <Link to="/">Về trang chủ</Link>
            </Button>
          }
        />
      </ReaderMessage>
    );
  }

  if (chapter.isError) {
    return (
      <ReaderMessage>
        <ErrorResult title="Chưa tải được chương" onRetry={() => chapter.refetch()} />
      </ReaderMessage>
    );
  }

  return (
    <div {...readerProps} className="min-h-dvh bg-reader-bg text-reader-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Bỏ qua tới nội dung chương
      </a>
      <ReaderToolbar
        story={c?.story}
        volume={c?.volume}
        chapterNo={c?.chapterNo}
        progress={progress}
        hidden={scrolledDown && !tocOpen && !settingsOpen}
        theme={settings.theme}
        tocOpen={tocOpen}
        onToc={() => setTocOpen(true)}
        settings={<ReaderSettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} update={update} />}
      />

      {c && showSplash && (
        <StorySplash
          story={{ storyId: c.story.storyId, title: c.story.title, penName: c.story.author.penName, coverUrl }}
          chapterLine={firstLine}
          onStart={startReading}
        />
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[760px] px-6 pt-10 pb-16 outline-none sm:pt-14">
        {c ? (
          <ChapterArticle
            key={c.chapterId}
            chapter={c}
            contentRef={contentRef}
            footer={<ChapterNav prev={prev} next={next} onToc={() => setTocOpen(true)} />}
          />
        ) : (
          <ChapterSkeleton />
        )}
      </main>

      {c && (
        <ReaderToc
          open={tocOpen}
          onOpenChange={setTocOpen}
          story={story.data}
          error={story.isError}
          currentChapterId={c.chapterId}
        />
      )}
    </div>
  );
}

/** Not found / error page of the reader: site surface, logo home, centred message. */
function ReaderMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center px-4">
          <Link to="/" aria-label="Novelle — Trang chủ">
            <Logo alt="" className="h-7" />
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-16">
        {children}
      </main>
    </div>
  );
}
