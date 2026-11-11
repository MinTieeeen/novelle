import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { normalizeQuery, parseSearchParams, toSearchParams } from '@/types/storySearch';

/**
 * Submit the header search: on /search keep the other filters (back to page 1), elsewhere start a new
 * search. Nothing is requested while typing; the search runs only on Enter (no search button).
 */
function useSubmitSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  return (text: string) => {
    const q = normalizeQuery(text);
    if (pathname === '/search') {
      const current = parseSearchParams(params);
      const sort = !q && current.sort === 'relevance' ? undefined : current.sort;
      navigate({ pathname: '/search', search: toSearchParams({ ...current, q, sort, page: 0 }).toString() });
    } else {
      navigate({ pathname: '/search', search: q ? `?q=${encodeURIComponent(q)}` : '' });
    }
  };
}

/** The `q` in the URL when on /search, so the box shows the current search (also after back / chips). */
function useUrlQuery() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  return pathname === '/search' ? (params.get('q') ?? '') : '';
}

const field =
  'flex h-10 w-full items-center gap-2 rounded-md bg-secondary pr-1 pl-3 text-muted-foreground focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid';

/** Wide search box in the middle of the header (≥ sm). */
export function HeaderSearch({ className }: { className?: string }) {
  const urlQuery = useUrlQuery();
  const [text, setText] = useState(urlQuery);
  const submit = useSubmitSearch();
  useEffect(() => setText(urlQuery), [urlQuery]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(text);
  }

  return (
    <form role="search" aria-label="Tìm truyện" onSubmit={onSubmit} className={cn('w-full max-w-[720px]', className)}>
      <label className={field}>
        <Search className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tìm truyện, tác giả…"
          aria-label="Tìm truyện, tác giả"
          maxLength={100}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button
            type="button"
            aria-label="Xoá nội dung tìm"
            onClick={() => setText('')}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </label>
    </form>
  );
}

/** Mobile (< sm) search icon of the header; the header holds `open` and renders MobileSearchRow under it. */
export function MobileSearchToggle({
  open,
  onToggle,
  ref,
}: {
  open: boolean;
  onToggle: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className="ml-auto sm:hidden"
      aria-label={open ? 'Đóng tìm kiếm' : 'Tìm truyện, tác giả'}
      aria-expanded={open}
      onClick={onToggle}
    >
      {open ? <X /> : <Search />}
    </Button>
  );
}

/** Full-width search row under the header on mobile (focused when it opens, Esc closes it). */
export function MobileSearchRow({ onClose }: { onClose: () => void }) {
  const urlQuery = useUrlQuery();
  const [text, setText] = useState(urlQuery);
  const submit = useSubmitSearch();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  return (
    <form
      role="search"
      aria-label="Tìm truyện"
      onSubmit={(e) => {
        e.preventDefault();
        submit(text);
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="border-t border-border px-4 py-2 sm:hidden"
    >
      <label className={field}>
        <Search className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
        <input
          ref={input}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tìm truyện, tác giả…"
          aria-label="Tìm truyện, tác giả"
          maxLength={100}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
    </form>
  );
}
