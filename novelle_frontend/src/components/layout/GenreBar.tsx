import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@/components/layout/Container';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Genre } from '@/types/story';

/** A pointer that moved more than this is a drag, not a click on the genre under it. */
const DRAG_THRESHOLD = 5;

interface GenreBarProps {
  genres: Genre[] | undefined;
  /** Slug of the genre being filtered on /search (one genre only), or null for "Tất cả" */
  activeSlug: string | null;
  /** Highlight "Tất cả" (on /search without a genre filter) */
  allActive?: boolean;
  loading?: boolean;
}

/* The bar sits on surface-sunken (light gray): the active genre is a raised white pill in cham. */
const ACTIVE = 'bg-card font-semibold text-primary shadow-sm';
const INACTIVE = 'text-foreground hover:bg-card/70';

const pill =
  'inline-flex h-7 shrink-0 snap-start items-center rounded-full px-2.5 text-small font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid';

/**
 * Horizontal genre bar under the header (replaces the hover genre menu): "Tất cả" + every genre (names
 * only), links to /search?genres=<slug>. Scrolls sideways by drag (mouse), swipe (touch), wheel
 * or the ‹ › buttons (shown only when part of the list is hidden); ← → / Home / End move between items.
 */
export function GenreBar({ genres, activeSlug, allActive, loading }: GenreBarProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef<{ x: number; scroll: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);

  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    updateEdges();
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges, genres]);

  // Bring the active genre into view (centred) when the page or the filter changes.
  useLayoutEffect(() => {
    const el = scroller.current;
    const item = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !item) return;
    el.scrollLeft = item.offsetLeft - el.clientWidth / 2 + item.offsetWidth / 2;
    updateEdges();
  }, [activeSlug, allActive, genres, updateEdges]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: reduce ? 'auto' : 'smooth' });
  };

  /* Drag to scroll with a mouse (touch devices scroll natively). */
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !scroller.current) return;
    drag.current = { x: e.clientX, scroll: scroller.current.scrollLeft, moved: false, id: e.pointerId };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      d.moved = true;
      el.setPointerCapture(d.id);
    }
    if (d.moved) el.scrollLeft = d.scroll - dx;
  }
  function onPointerUp() {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  }

  /* Vertical wheel scrolls the bar sideways when it overflows. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* Roving focus between the links. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const links = [...(scroller.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: links.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, next))]?.focus();
  }

  const items = genres ?? [];

  return (
    <div className="border-b border-border bg-secondary">
      <Container className="relative">
        <nav aria-label="Thể loại" className="relative">
          {edges.left && <EdgeButton dir="left" onClick={() => scrollByPage(-1)} />}
          <div
            ref={scroller}
            onScroll={updateEdges}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={(e) => {
              if (suppressClick.current) {
                e.preventDefault();
                e.stopPropagation();
                suppressClick.current = false;
              }
            }}
            onKeyDown={onKeyDown}
            className={cn(
              'no-scrollbar flex h-10 snap-x snap-proximity items-center gap-0.5 overflow-x-auto sm:h-11',
              edges.left && '[mask-image:linear-gradient(to_right,transparent,black_48px)]',
              edges.right && '[mask-image:linear-gradient(to_left,transparent,black_48px)]',
              edges.left && edges.right && '[mask-image:linear-gradient(to_right,transparent,black_48px,black_calc(100%-48px),transparent)]',
            )}
          >
            {loading && !genres ? (
              Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-7 w-20 shrink-0 rounded-full bg-card" />)
            ) : (
              <>
                <Link
                  to="/search"
                  draggable={false}
                  aria-current={allActive ? 'page' : undefined}
                  className={cn(pill, allActive ? ACTIVE : INACTIVE)}
                >
                  Tất cả
                </Link>
                {items.map((g) => {
                  const active = g.slug === activeSlug;
                  return (
                    <Link
                      key={g.genreId}
                      to={`/search?genres=${g.slug}`}
                      draggable={false}
                      aria-current={active ? 'page' : undefined}
                      className={cn(pill, active ? ACTIVE : INACTIVE)}
                    >
                      {g.name}
                    </Link>
                  );
                })}
              </>
            )}
          </div>
          {edges.right && <EdgeButton dir="right" onClick={() => scrollByPage(1)} />}
        </nav>
      </Container>
    </div>
  );
}

function EdgeButton({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={dir === 'left' ? 'Cuộn sang trái' : 'Cuộn sang phải'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-foreground shadow-raise transition-colors hover:bg-secondary sm:grid',
        dir === 'left' ? '-left-2' : '-right-2',
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
