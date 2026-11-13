import { Check, ChevronDown, Star, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AgeRating, CompletionStatus, Genre, Tag } from '@/types/story';
import {
  applyChapterRange,
  chapterRangeOf,
  CHAPTER_RANGES,
  MAX_GENRES,
  MAX_TAGS,
  tagLabel,
  type GenreMode,
  type StorySearchParams,
} from '@/types/storySearch';
import { formatNumber } from '@/utils/format';


const STATUS_CHIPS: { value?: CompletionStatus; label: string }[] = [
  { label: 'Tất cả' },
  { value: 'ONGOING', label: 'Đang ra' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'HIATUS', label: 'Tạm ngưng' },
];

const AGE_CHIPS: { value?: AgeRating; label: string }[] = [
  { label: 'Tất cả' },
  { value: 'ALL', label: 'Mọi lứa tuổi' },
  { value: '13+', label: '13+' },
  { value: '18+', label: '18+' },
];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-secondary',
      )}
    >
      {children}
    </button>
  );
}

function Group({ legend, aside, children }: { legend: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <div className="mb-2.5 flex items-baseline justify-between">
        <legend className="p-0 text-label font-semibold">{legend}</legend>
        {aside}
      </div>
      {children}
    </fieldset>
  );
}

/** Removable pill (selected genre: filled; tag: cham-soft). */
export function FilterPill({ label, onRemove, removeLabel, tone = 'primary' }: { label: string; onRemove: () => void; removeLabel: string; tone?: 'primary' | 'soft' }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full pr-1 pl-2.5 text-small font-medium',
        tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
      )}
    >
      {label}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="grid size-[22px] place-items-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <X className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}

interface StoryFiltersProps {
  filters: StorySearchParams;
  onChange: (patch: Partial<StorySearchParams>) => void;
  onReset: () => void;
  genres: Genre[];
  /** Suggestions for the tag input (GET /api/tags?q=), loaded by the page */
  tagSuggestions: Tag[];
  onTagQueryChange: (q: string) => void;
  /** slug → name of tags seen in suggestions, for the pills */
  tagNames?: Record<string, string>;
  className?: string;
}

/**
 * Filter panel of /search (SearchFilters board): status, age, rating, chapter count, genres (dialog,
 * up to 5, "Có tất cả / Có bất kỳ"), tags (input + suggestions, up to 5), "Xoá bộ lọc".
 * Every change is applied at once (the page writes it to the URL).
 */
export function StoryFilters({ filters, onChange, onReset, genres, tagSuggestions, onTagQueryChange, tagNames, className }: StoryFiltersProps) {
  const [genreDialog, setGenreDialog] = useState(false);
  const range = chapterRangeOf(filters);
  const rating = filters.minRating ?? 0;
  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug;
  const genreButtonLabel =
    filters.genres.length === 0 ? 'Chọn thể loại' : `${filters.genres.length} thể loại · ${filters.genreMode === 'any' ? 'có bất kỳ' : 'có tất cả'}`;

  return (
    <aside aria-label="Bộ lọc" className={cn('flex flex-col gap-5 rounded-lg border border-border bg-card p-5', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[20px] leading-[26px] font-semibold">Bộ lọc</h2>
        <button type="button" onClick={onReset} className="p-1 text-small font-medium text-link hover:underline">
          Xoá bộ lọc
        </button>
      </div>

      <Group legend="Tình trạng">
        <div className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.label} on={filters.status === c.value} onClick={() => onChange({ status: c.value })}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Group>
      <hr className="border-border" />

      <Group legend="Độ tuổi">
        <div className="flex flex-wrap gap-2">
          {AGE_CHIPS.map((c) => (
            <Chip key={c.label} on={filters.ageRating === c.value} onClick={() => onChange({ ageRating: c.value })}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Group>
      <hr className="border-border" />

      <Group
        legend="Điểm đánh giá"
        aside={
          <span className="inline-flex items-center gap-1 text-label font-semibold">
            {rating > 0 ? (
              <>
                Từ {rating}
                <Star aria-hidden className="size-4 fill-nghe text-nghe" strokeWidth={1.75} />
              </>
            ) : (
              <span className="font-normal text-muted-foreground">Tất cả</span>
            )}
          </span>
        }
      >
        <div aria-hidden className="mb-1.5 flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className={cn('size-4', i <= rating ? 'fill-nghe text-nghe' : 'text-input')} strokeWidth={1.75} />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={rating}
          onChange={(e) => onChange({ minRating: Number(e.target.value) || undefined })}
          aria-label="Điểm đánh giá tối thiểu"
          aria-valuetext={rating > 0 ? `Từ ${rating} sao` : 'Tất cả'}
          className="w-full cursor-pointer accent-nghe"
        />
        <div aria-hidden className="flex justify-between text-caption text-muted-foreground">
          <span>Tất cả</span>
          <span>5</span>
        </div>
      </Group>
      <hr className="border-border" />

      <Group legend="Số chương">
        <div className="flex flex-wrap gap-2">
          {CHAPTER_RANGES.map((r) => (
            <Chip key={r.key} on={range === r.key} onClick={() => onChange(applyChapterRange(r.key))}>
              {r.label}
            </Chip>
          ))}
        </div>
        {range === null && (
          <p className="mt-2 text-small text-muted-foreground">
            Đang lọc {filters.minChapters ?? 0}–{filters.maxChapters ?? '∞'} chương
          </p>
        )}
      </Group>
      <hr className="border-border" />

      <Group legend="Thể loại">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setGenreDialog(true)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-card px-3 text-label font-medium hover:bg-secondary"
        >
          <span>{genreButtonLabel}</span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
        </button>
        {filters.genres.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {filters.genres.map((slug) => (
              <FilterPill
                key={slug}
                label={genreName(slug)}
                removeLabel={`Bỏ ${genreName(slug)}`}
                onRemove={() => onChange({ genres: filters.genres.filter((g) => g !== slug) })}
              />
            ))}
          </div>
        )}
        <GenrePickerDialog
          open={genreDialog}
          onOpenChange={setGenreDialog}
          genres={genres}
          selected={filters.genres}
          mode={filters.genreMode}
          onApply={(selected, mode) => onChange({ genres: selected, genreMode: mode })}
        />
      </Group>
      <hr className="border-border" />

      <Group legend="Tag">
        <TagPicker
          selected={filters.tags}
          suggestions={tagSuggestions}
          onQueryChange={onTagQueryChange}
          names={tagNames}
          onChange={(tags) => onChange({ tags })}
        />
      </Group>
    </aside>
  );
}

interface GenrePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genres: Genre[];
  selected: string[];
  mode: GenreMode;
  onApply: (selected: string[], mode: GenreMode) => void;
}

/** "Chọn thể loại" dialog: two-column checklist (max 5), all/any segmented control, applied on "Xong". */
export function GenrePickerDialog({ open, onOpenChange, genres, selected, mode, onApply }: GenrePickerDialogProps) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [draftMode, setDraftMode] = useState<GenreMode>(mode);
  const full = draft.length >= MAX_GENRES;

  function openChange(next: boolean) {
    if (next) {
      setDraft(selected);
      setDraftMode(mode);
    }
    onOpenChange(next);
  }

  function toggle(slug: string) {
    setDraft((d) => (d.includes(slug) ? d.filter((s) => s !== slug) : d.length < MAX_GENRES ? [...d, slug] : d));
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[min(600px,calc(100dvh-32px))] flex-col gap-0 p-0 sm:max-w-[400px]">
        <div className="px-5 pt-4 pb-3">
          <DialogTitle className="font-sans text-[18px] leading-6 font-semibold">Chọn thể loại</DialogTitle>
          <p className="text-small text-muted-foreground">Tối đa {MAX_GENRES} thể loại.</p>
        </div>
        <div role="radiogroup" aria-label="Cách khớp thể loại" className="mx-5 mb-2 grid grid-cols-2 rounded-md bg-secondary p-[3px]">
          {(
            [
              ['all', 'Có tất cả'],
              ['any', 'Có bất kỳ'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draftMode === value}
              onClick={() => setDraftMode(value)}
              className={cn(
                'h-[30px] rounded-[6px] text-small font-medium transition-colors',
                draftMode === value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-4 overflow-y-auto px-5">
          {genres.map((g) => {
            const on = draft.includes(g.slug);
            const disabled = !on && full;
            return (
              <label key={g.genreId} className={cn('flex cursor-pointer items-center gap-2.5 py-2 text-label', disabled && 'cursor-not-allowed opacity-50')}>
                <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={() => toggle(g.slug)} />
                <span
                  aria-hidden
                  className={cn(
                    'grid size-[18px] shrink-0 place-items-center rounded-sm border-[1.5px] text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid',
                    on ? 'border-primary bg-primary' : 'border-input bg-card',
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="num text-caption text-muted-foreground">{formatNumber(g.storyCount)}</span>
              </label>
            );
          })}
        </div>
        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-5 py-3 sm:justify-between">
          <button type="button" onClick={() => setDraft([])} className="p-1 text-small font-medium text-link hover:underline">
            Bỏ chọn
          </button>
          <Button
            onClick={() => {
              onApply(draft, draftMode);
              onOpenChange(false);
            }}
          >
            Xong
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TagPickerProps {
  selected: string[];
  suggestions: Tag[];
  onQueryChange: (q: string) => void;
  onChange: (tags: string[]) => void;
  names?: Record<string, string>;
}

/** Tag pills + "Thêm tag" input with a suggestion list (only existing tags can be picked). */
export function TagPicker({ selected, suggestions, onQueryChange, onChange, names }: TagPickerProps) {
  const listId = useId();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const full = selected.length >= MAX_TAGS;
  const options = text.trim() ? suggestions.filter((t) => !selected.includes(t.slug)).slice(0, 8) : [];

  function add(tag: Tag) {
    onChange([...selected, tag.slug]);
    setText('');
    onQueryChange('');
    setActive(0);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((slug) => (
            <FilterPill
              key={slug}
              tone="soft"
              label={`#${tagLabel(slug, names)}`}
              removeLabel={`Bỏ tag ${tagLabel(slug, names)}`}
              onRemove={() => onChange(selected.filter((t) => t !== slug))}
            />
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Thêm tag"
          placeholder={full ? `Tối đa ${MAX_TAGS} tag` : 'Thêm tag'}
          disabled={full}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            onQueryChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && options[active]) {
              e.preventDefault();
              add(options[active]);
            } else if (e.key === 'Escape') setText('');
            else return;
            e.preventDefault();
          }}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-label outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50"
        />
        {options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-raise">
            {options.map((t, i) => (
              <li
                key={t.tagId}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(t);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-label', i === active && 'bg-accent text-accent-foreground')}
              >
                <span>#{t.name}</span>
                <span className="num text-caption text-muted-foreground">{formatNumber(t.usageCount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const CHAPTER_CHIP_LABEL = {
  lt50: 'Dưới 50 chương',
  gte50: 'Từ 50 chương',
  gte200: '200+ chương',
  gte500: '500+ chương',
} as const;

interface ActiveFilterChipsProps {
  filters: StorySearchParams;
  genres: Genre[];
  tagNames?: Record<string, string>;
  onChange: (patch: Partial<StorySearchParams>) => void;
}

/** Chips of the active filters above the results (Search board), each with "Bỏ bộ lọc …". */
export function ActiveFilterChips({ filters, genres, tagNames, onChange }: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; remove: Partial<StorySearchParams> }[] = [];
  for (const slug of filters.genres) {
    chips.push({ key: `g-${slug}`, label: genres.find((g) => g.slug === slug)?.name ?? slug, remove: { genres: filters.genres.filter((g) => g !== slug) } });
  }
  for (const slug of filters.tags) {
    chips.push({ key: `t-${slug}`, label: `#${tagLabel(slug, tagNames)}`, remove: { tags: filters.tags.filter((t) => t !== slug) } });
  }
  if (filters.status) chips.push({ key: 'status', label: STATUS_CHIPS.find((c) => c.value === filters.status)!.label, remove: { status: undefined } });
  if (filters.ageRating) chips.push({ key: 'age', label: AGE_CHIPS.find((c) => c.value === filters.ageRating)!.label, remove: { ageRating: undefined } });
  if (filters.minChapters != null || filters.maxChapters != null) {
    const r = chapterRangeOf(filters);
    const label =
      r && r !== 'all'
        ? CHAPTER_CHIP_LABEL[r]
        : `${filters.minChapters ?? 0}–${filters.maxChapters ?? '∞'} chương`;
    chips.push({ key: 'chapters', label, remove: { minChapters: undefined, maxChapters: undefined } });
  }
  if (filters.minRating) chips.push({ key: 'rating', label: `Từ ${filters.minRating} sao`, remove: { minRating: undefined } });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Bộ lọc đang bật">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-8 items-center gap-1 rounded-full border border-input bg-card pr-1 pl-3 text-small font-medium">
          {c.label}
          <button
            type="button"
            aria-label={`Bỏ bộ lọc ${c.label}`}
            onClick={() => onChange(c.remove)}
            className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
