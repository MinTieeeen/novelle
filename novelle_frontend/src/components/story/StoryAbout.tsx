import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Four lines of 30px: longer descriptions are collapsed behind "Xem thêm". */
const COLLAPSED_PX = 120;

/**
 * "Giới thiệu" (StoryAbout board): the description in paragraphs (blank lines), Literata 17/30,
 * collapsed to four lines with a fade and a "Xem thêm / Thu gọn" toggle when it is longer.
 */
export function StoryAbout({ description }: { description?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const paragraphs = (description ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > COLLAPSED_PX + 4);
  }, [description]);

  return (
    <section aria-labelledby="about-h" className="flex flex-col gap-3">
      <h2 id="about-h" className="text-title-2 font-semibold">
        Giới thiệu
      </h2>
      {paragraphs.length === 0 ? (
        <p className="text-muted-foreground">Tác giả chưa viết giới thiệu cho truyện này.</p>
      ) : (
        <>
          <div
            id="about-body"
            ref={ref}
            className={cn('relative overflow-hidden', !expanded && overflows && 'max-h-[120px]')}
          >
            {paragraphs.map((p, i) => (
              <p key={i} className="mb-3 font-serif text-[17px] leading-[30px] whitespace-pre-line last:mb-0">
                {p}
              </p>
            ))}
            {!expanded && overflows && (
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-15 bg-gradient-to-b from-transparent to-background" />
            )}
          </div>
          {overflows && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls="about-body"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 self-start py-1 text-label font-medium text-link hover:underline"
            >
              {expanded ? 'Thu gọn' : 'Xem thêm'}
              <ChevronDown aria-hidden className={cn('size-4 transition-transform', expanded && 'rotate-180')} strokeWidth={1.75} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
