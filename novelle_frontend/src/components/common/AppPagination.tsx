import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/utils/format';

interface AppPaginationProps {
  /** 0-based, as the API sends it */
  page: number;
  totalPages: number;
  totalElements?: number;
  /** "truyện" → "233 truyện" */
  unit?: string;
  onPageChange: (page: number) => void;
  className?: string;
}

const square =
  'grid size-10 place-items-center rounded-md border border-input bg-card text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:border-border disabled:bg-card disabled:text-input';

function NavButton({ label, icon: Icon, disabled, onClick }: { label: string; icon: LucideIcon; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={square}>
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * Compact pagination placed under a list: « ‹ Trang 4 / 12 › » with buttons to the first, previous,
 * next and last page; no list of page numbers. Pages are shown 1-based, `page` / `onPageChange` are
 * 0-based like PageResponse. Renders nothing when everything fits on one page.
 */
export function AppPagination({ page, totalPages, totalElements, unit = 'truyện', onPageChange, className }: AppPaginationProps) {
  if (totalPages <= 1) return null;
  const last = totalPages - 1;
  const atStart = page <= 0;
  const atEnd = page >= last;

  return (
    <nav aria-label="Phân trang" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <span className="text-label text-muted-foreground">{totalElements != null && `${formatNumber(totalElements)} ${unit}`}</span>
      <div className="flex items-center gap-1">
        <NavButton label="Trang đầu" icon={ChevronsLeft} disabled={atStart} onClick={() => onPageChange(0)} />
        <NavButton label="Trang trước" icon={ChevronLeft} disabled={atStart} onClick={() => onPageChange(page - 1)} />
        <span aria-live="polite" className="num min-w-[110px] px-2 text-center text-label font-medium">
          Trang {formatNumber(page + 1)} / {formatNumber(totalPages)}
        </span>
        <NavButton label="Trang sau" icon={ChevronRight} disabled={atEnd} onClick={() => onPageChange(page + 1)} />
        <NavButton label="Trang cuối" icon={ChevronsRight} disabled={atEnd} onClick={() => onPageChange(last)} />
      </div>
    </nav>
  );
}
