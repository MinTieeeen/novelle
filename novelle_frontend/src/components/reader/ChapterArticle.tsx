import { Eye } from 'lucide-react';
import { useMemo, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import type { ChapterRead } from '@/types/reading';
import { chapterLabel } from '@/types/story';
import { formatDate, formatNumber } from '@/utils/format';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import '@/styles/reader.css';

interface ChapterArticleProps {
  chapter: ChapterRead;
  /** the chapter body: useReadingProgress measures over it */
  contentRef?: Ref<HTMLDivElement>;
  /** ChapterNav, under the end mark */
  footer?: ReactNode;
}

/**
 * Chapter body (board ChapterReader): volume line, italic Literata title, meta (author · date · views),
 * the sanitized text in the 680px reading column and the • • • end mark. Colours from the reading surface.
 */
export function ChapterArticle({ chapter, contentRef, footer }: ChapterArticleProps) {
  const html = useMemo(() => sanitizeHtml(chapter.content), [chapter.content]);
  return (
    <article aria-labelledby="chapter-title" className="mx-auto max-w-reading">
      {chapter.volume && (
        <p className="mb-2 text-small text-reader-muted">
          Tập {chapter.volume.volumeNo} · {chapter.volume.title}
        </p>
      )}
      <h1 id="chapter-title" className="mb-3 font-serif text-[26px] leading-[34px] font-[560] italic sm:text-chapter-title">
        {chapterLabel(chapter)}
      </h1>
      <div className="mb-10 flex flex-wrap gap-x-4 gap-y-1.5 text-small text-reader-muted">
        <Link to={`/authors/${chapter.story.author.authorId}`} className="font-medium hover:underline">
          {chapter.story.author.penName}
        </Link>
        <span>{formatDate(chapter.publishedAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
          {formatNumber(chapter.viewCount)}
          <span className="sr-only"> lượt xem</span>
        </span>
      </div>
      <div ref={contentRef} className="reader" dangerouslySetInnerHTML={{ __html: html }} />
      <div aria-hidden className="mt-12 mb-10 flex justify-center gap-3 text-reader-muted">
        <span className="size-1.5 rounded-full bg-current" />
        <span className="size-1.5 rounded-full bg-current" />
        <span className="size-1.5 rounded-full bg-current" />
      </div>
      {footer}
    </article>
  );
}
