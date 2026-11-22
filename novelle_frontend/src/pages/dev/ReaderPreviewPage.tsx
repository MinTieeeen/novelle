import { useCallback, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { chapterRead, firstChapterRead, lastChapterRead, readingProgress } from '../../../e2e/fixtures/reading';
import { storyDetail } from '../../../e2e/fixtures/story';
import { ChapterArticle } from '@/components/reader/ChapterArticle';
import { ChapterNav, type NavTarget } from '@/components/reader/ChapterNav';
import { ChapterSkeleton } from '@/components/reader/ChapterSkeleton';
import { ContinueReadingButton } from '@/components/reader/ContinueReadingButton';
import { ReaderSettingsMenu } from '@/components/reader/ReaderSettingsPanel';
import { ReaderToc } from '@/components/reader/ReaderToc';
import { ReaderToolbar } from '@/components/reader/ReaderToolbar';
import { StorySplash } from '@/components/reader/StorySplash';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import { useReaderSettings, type ReaderTheme } from '@/hooks/useReaderSettings';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { buildTocGroups } from '@/components/story/tocGroups';
import { chapterLabel } from '@/types/story';

const CHAPTERS = { first: firstChapterRead, middle: chapterRead, last: lastChapterRead } as const;
const ALL = buildTocGroups(storyDetail.volumes, storyDetail.looseChapters).flatMap((g) => g.chapters);

function target(id: number | null | undefined): NavTarget | null {
  if (id == null) return null;
  const c = ALL.find((x) => x.chapterId === id);
  return c ? { chapterId: id, chapterNo: c.chapterNo, title: c.title } : { chapterId: id };
}

/**
 * Dev-only preview of the reader components with fixtures (/dev/reader). Query: ?chapter=first|middle|last,
 * ?theme=paper|sepia|night, ?panel=settings|toc, ?loading=1. No API calls: progress is measured, not saved.
 */
export default function ReaderPreviewPage() {
  const [params, setParams] = useSearchParams();
  const chapter = CHAPTERS[(params.get('chapter') as keyof typeof CHAPTERS) ?? 'middle'] ?? chapterRead;
  const { settings, update, readerProps } = useReaderSettings();
  const themeParam = params.get('theme') as ReaderTheme | null;
  const theme = themeParam ?? settings.theme;
  const panel = params.get('panel');
  const [tocOpen, setTocOpen] = useState(panel === 'toc');
  const [settingsOpen, setSettingsOpen] = useState(panel === 'settings');
  const contentRef = useRef<HTMLDivElement>(null);
  const progress = useReadingProgress({ storyId: chapter.story.storyId, chapterId: chapter.chapterId, contentRef, save: false });
  const { hidden: scrolledDown } = useHideOnScroll();
  const articleRef = useRef<HTMLDivElement>(null);
  const start = useCallback(() => {
    const top = (articleRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 59;
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  const setTheme = (t: ReaderTheme) => {
    update({ theme: t });
    if (themeParam)
      setParams(
        (p) => {
          p.delete('theme');
          return p;
        },
        { replace: true },
      );
  };

  return (
    <div {...readerProps} data-reader-theme={theme} className="min-h-dvh bg-reader-bg text-reader-ink">
      <ReaderToolbar
        story={chapter.story}
        volume={chapter.volume}
        chapterNo={chapter.chapterNo}
        progress={progress}
        hidden={scrolledDown && !tocOpen && !settingsOpen}
        theme={theme}
        tocOpen={tocOpen}
        onToc={() => setTocOpen(true)}
        settings={
          <ReaderSettingsMenu
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            settings={{ ...settings, theme }}
            update={(patch) => (patch.theme ? setTheme(patch.theme) : update(patch))}
          />
        }
      />

      {!chapter.prevChapterId && (
        <StorySplash
          story={{ storyId: storyDetail.storyId, title: storyDetail.title, penName: storyDetail.author.penName, coverUrl: storyDetail.coverUrl }}
          chapterLine={[chapter.volume && `Tập ${chapter.volume.volumeNo}`, chapterLabel(chapter)].filter(Boolean).join(' · ')}
          onStart={start}
        />
      )}

      <main id="main" ref={articleRef} tabIndex={-1} className="mx-auto max-w-[760px] px-6 pt-10 pb-16 outline-none sm:pt-14">
        {params.get('loading') ? (
          <ChapterSkeleton />
        ) : (
          <ChapterArticle
            chapter={chapter}
            contentRef={contentRef}
            footer={<ChapterNav prev={target(chapter.prevChapterId)} next={target(chapter.nextChapterId)} onToc={() => setTocOpen(true)} />}
          />
        )}
      </main>

      <section className="mx-auto flex max-w-[760px] flex-col gap-4 border-t border-reader-line px-6 py-10 font-sans">
        <h2 className="text-label font-semibold text-reader-muted">Xem trước · trang truyện</h2>
        <div className="rounded-lg bg-background p-6 text-foreground">
          <ContinueReadingButton progress={readingProgress} />
        </div>
        <p className="text-small text-reader-muted">
          <Link to="?chapter=first" className="underline">Chương đầu</Link> ·{' '}
          <Link to="?chapter=middle" className="underline">Chương giữa</Link> ·{' '}
          <Link to="?chapter=last" className="underline">Chương cuối</Link> ·{' '}
          <Link to="?loading=1" className="underline">Đang tải</Link>
        </p>
      </section>

      <ReaderToc open={tocOpen} onOpenChange={setTocOpen} story={storyDetail} currentChapterId={chapter.chapterId} />
    </div>
  );
}
