import { ArrowDownUp, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { chapterLabel, type ChapterToc as Chapter, type VolumeToc } from '@/types/story';
import { chapterRange, formatDate, formatNumber } from '@/utils/format';

interface ChapterTocProps {
  volumes: VolumeToc[];
  looseChapters: Chapter[];
  chapterCount: number;
  /** FE3: chapter being read → nghe-soft row + ribbon + "Đang đọc"; earlier chapters are muted */
  currentChapterNo?: number | null;
  currentChapterId?: number | null;
}

interface Group {
  key: string;
  heading: string;
  range: string;
  chapters: Chapter[];
}

/**
 * Table of contents (TableOfContents board / DS TableOfContents): one collapsible group per volume
 * ("Tập 2 · Tên · Chương 41–87"), loose chapters last, dates DD/MM/YYYY, oldest/newest toggle.
 * The volume holding the current chapter opens by default (the first one when nothing is being read).
 */
export function ChapterToc({ volumes, looseChapters, chapterCount, currentChapterNo, currentChapterId }: ChapterTocProps) {
  const [newestFirst, setNewestFirst] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = volumes.map((v) => ({
      key: `v${v.volumeId}`,
      heading: `Tập ${v.volumeNo} · ${v.title}`,
      range: chapterRange(v.chapters.map((c) => c.chapterNo)),
      chapters: v.chapters,
    }));
    if (looseChapters.length > 0) {
      out.push({
        key: 'loose',
        heading: volumes.length > 0 ? 'Chương lẻ' : 'Danh sách chương',
        range: chapterRange(looseChapters.map((c) => c.chapterNo)),
        chapters: looseChapters,
      });
    }
    const sorted = out.map((g) => ({
      ...g,
      chapters: [...g.chapters].sort((a, b) => (newestFirst ? b.chapterNo - a.chapterNo : a.chapterNo - b.chapterNo)),
    }));
    return newestFirst ? sorted.reverse() : sorted;
  }, [volumes, looseChapters, newestFirst]);

  // Opened groups are set once from the reading position; flipping the order keeps them.
  const [open, setOpen] = useState<Set<string>>(() => {
    const withCurrent = groups.find((g) => g.chapters.some((c) => c.chapterId === currentChapterId));
    const key = withCurrent?.key ?? groups[0]?.key;
    return new Set(key ? [key] : []);
  });

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const volumeCount = volumes.length;

  return (
    <section aria-labelledby="toc-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="toc-h" className="text-title-2 font-semibold">
          Mục lục{' '}
          <span className="font-sans text-label font-normal text-muted-foreground">
            {formatNumber(chapterCount)} chương{volumeCount > 0 && ` · ${volumeCount} tập`}
          </span>
        </h2>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="inline-flex items-center gap-1.5 py-1 text-label font-medium text-link hover:underline"
          >
            <ArrowDownUp aria-hidden className="size-4" strokeWidth={1.75} />
            {newestFirst ? 'Cũ nhất trước' : 'Mới nhất trước'}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">Truyện chưa có chương nào được đăng.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {groups.map((g, gi) => {
            const isOpen = open.has(g.key);
            const panelId = `toc-${g.key}`;
            return (
              <div key={g.key} className={cn(gi > 0 && 'border-t border-border')}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(g.key)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-secondary"
                >
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{g.heading}</span>
                    <span className="text-small text-muted-foreground">{g.range}</span>
                  </span>
                  <ChevronDown
                    aria-hidden
                    strokeWidth={1.75}
                    className={cn('size-5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                  />
                </button>
                {isOpen && (
                  <ol id={panelId} className="flex flex-col px-2 pb-3">
                    {g.chapters.map((c) => {
                      const current = c.chapterId === currentChapterId;
                      const read = !current && currentChapterNo != null && c.chapterNo < currentChapterNo;
                      return (
                        <li key={c.chapterId}>
                          <Link
                            to={`/chapters/${c.chapterId}`}
                            aria-current={current ? 'location' : undefined}
                            className={cn(
                              'relative flex items-center gap-3 rounded-md py-2 pr-3 text-label transition-colors',
                              current ? 'bg-nghe-soft pl-8 font-semibold' : 'pl-3 hover:bg-secondary',
                              read && 'text-muted-foreground',
                            )}
                          >
                            {current && <span aria-hidden className="ribbon absolute top-0 left-3 h-[26px] w-2.5" />}
                            <span className="min-w-0 flex-1 truncate">{chapterLabel(c)}</span>
                            {current && (
                              <span className="hidden h-[22px] shrink-0 rounded-full bg-nghe-ink px-2 text-caption leading-[22px] font-semibold text-card sm:inline">
                                Đang đọc
                              </span>
                            )}
                            <span className="num shrink-0 text-right text-caption font-normal whitespace-nowrap text-muted-foreground sm:w-[88px]">
                              {formatDate(c.publishedAt)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
