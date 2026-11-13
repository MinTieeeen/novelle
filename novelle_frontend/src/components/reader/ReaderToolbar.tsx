import { ChevronLeft, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import type { ReaderTheme } from '@/hooks/useReaderSettings';
import { cn } from '@/lib/utils';
import { toolbarButton } from './readerStyles';

interface ReaderToolbarProps {
  /** undefined while the chapter loads: back goes home, no breadcrumb */
  story?: { slug: string; title: string };
  volume?: { volumeNo: number; title: string } | null;
  chapterNo?: number;
  /** 0–100, the 3px nghe bar */
  progress: number;
  /** slid up (scrolling down); the progress bar stays visible */
  hidden?: boolean;
  theme: ReaderTheme;
  tocOpen?: boolean;
  onToc: () => void;
  /** the "Aa" settings control (ReaderSettingsMenu) */
  settings: ReactNode;
}

/**
 * Reader toolbar (board ReaderToolbar): back to the story, logo, breadcrumb story › volume › chapter,
 * "Mục lục", "Aa" and the 3px reading progress bar. Colours follow the reading surface. It slides up
 * while scrolling down, leaving only the progress bar.
 */
export function ReaderToolbar({ story, volume, chapterNo, progress, hidden, theme, tocOpen, onToc, settings }: ReaderToolbarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-reader-line bg-reader-bar font-sans text-reader-ink transition-transform duration-200 motion-reduce:transition-none',
        hidden && '-translate-y-[calc(100%-3px)]',
      )}
    >
      <div className="mx-auto flex min-h-14 max-w-[1100px] items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <Link
          to={story ? `/stories/${story.slug}` : '/'}
          aria-label={story ? 'Về trang truyện' : 'Về trang chủ'}
          className={cn(toolbarButton, 'w-10 px-0')}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
        </Link>
        <Link to="/" aria-label="Novelle — Trang chủ" className="flex flex-none rounded-sm">
          {/* The wordmark is cham ink: on the night surface only the mark stays legible. */}
          <Logo variant="mark" alt="" className={cn('h-7', theme !== 'night' && 'sm:hidden')} />
          {theme !== 'night' && <Logo alt="" className="hidden h-7 sm:block" />}
        </Link>
        <nav aria-label="Đường dẫn" className="min-w-0 flex-1 truncate text-label text-reader-muted">
          {story && (
            <Link to={`/stories/${story.slug}`} className="font-semibold text-reader-ink hover:underline">
              {story.title}
            </Link>
          )}
          {volume && (
            <span className="max-md:hidden">
              {' '}
              › Tập {volume.volumeNo} · {volume.title}
            </span>
          )}
          {chapterNo !== undefined && <span> › Chương {chapterNo}</span>}
        </nav>
        <button
          type="button"
          onClick={onToc}
          aria-haspopup="dialog"
          aria-expanded={tocOpen ?? false}
          className={cn(toolbarButton, 'max-sm:w-10 max-sm:px-0')}
        >
          <List aria-hidden className="size-[18px]" strokeWidth={1.75} />
          <span className="max-sm:sr-only">Mục lục</span>
        </button>
        {settings}
      </div>
      <div
        role="progressbar"
        aria-label="Đã đọc"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-[3px] bg-reader-line"
      >
        <div className="h-full bg-nghe" style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}
