import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/utils/format';

export interface FilterTab<V extends string> {
  value: V;
  label: string;
  /** shown in muted text after the label; undefined = unknown (no number) */
  count?: number;
}

interface AdminFilterTabsProps<V extends string> {
  label: string;
  tabs: FilterTab<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/**
 * Segmented filter tabs on a sunken background (AdminUsers, AdminStories, AdminCatalog, AdminRequests
 * boards): `role="tablist"`, the selected tab raised; arrow keys move between tabs.
 */
export function AdminFilterTabs<V extends string>({ label, tabs, value, onChange, className }: AdminFilterTabsProps<V>) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.value === value);
    const next = tabs[(i + delta + tabs.length) % tabs.length];
    onChange(next.value);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('no-scrollbar inline-flex w-fit max-w-full overflow-x-auto rounded-[10px] bg-secondary p-[3px]', className)}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-value={t.value}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              'h-[34px] shrink-0 rounded-md px-3.5 text-label font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
              on ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count != null && <span className="num font-normal text-muted-foreground"> {formatNumber(t.count)}</span>}
          </button>
        );
      })}
    </div>
  );
}
