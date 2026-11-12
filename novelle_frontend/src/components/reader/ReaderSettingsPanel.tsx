import type { KeyboardEvent, ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  LINE_SPACING,
  READER_FONT_MAX,
  READER_FONT_MIN,
  READER_THEMES,
  type ReaderSettings,
} from '@/hooks/useReaderSettings';
import { cn } from '@/lib/utils';
import { focusRing, toolbarButton } from './readerStyles';

interface PanelProps {
  settings: ReaderSettings;
  update: (patch: Partial<ReaderSettings>) => void;
}

/** Arrow keys move the choice inside a radiogroup made of buttons (roving tabindex). */
function onRadioKeys(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  if (!keys.includes(e.key)) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const i = radios.findIndex((r) => r === document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  const next = radios[(i + step + radios.length) % radios.length];
  next.focus();
  next.click();
}

function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-label font-semibold">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

const sizeButton = cn(
  'h-10 rounded-md border border-input bg-card font-serif font-semibold text-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40',
  focusRing,
);

/**
 * Reading settings (board ReaderSettings): reading surface (3 swatches), font size A− / A+ 16–24 px with a
 * track, line spacing Hẹp / Vừa / Rộng. Changes apply immediately and are kept by useReaderSettings.
 */
export function ReaderSettingsPanel({ settings, update }: PanelProps) {
  const sizePct = ((settings.fontSize - READER_FONT_MIN) / (READER_FONT_MAX - READER_FONT_MIN)) * 100;
  return (
    <div className="flex flex-col gap-5 font-sans text-foreground">
      <Field label="Nền đọc">
        <div role="radiogroup" aria-label="Nền đọc" onKeyDown={onRadioKeys} className="grid grid-cols-3 gap-2">
          {READER_THEMES.map((t) => {
            const on = settings.theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-reader-theme={t.value}
                onClick={() => update({ theme: t.value })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md bg-reader-bg py-2.5 text-small font-medium text-reader-ink',
                  focusRing,
                  on ? 'border-2 border-primary' : 'border border-input',
                )}
              >
                <span aria-hidden className="font-serif text-[20px] leading-6 font-semibold">
                  Aa
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Cỡ chữ" aside={<span className="num text-small text-muted-foreground">{settings.fontSize}px</span>}>
        <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2.5">
          <button
            type="button"
            aria-label="Giảm cỡ chữ"
            disabled={settings.fontSize <= READER_FONT_MIN}
            onClick={() => update({ fontSize: settings.fontSize - 1 })}
            className={cn(sizeButton, 'text-[13px]')}
          >
            A−
          </button>
          <div aria-hidden className="h-1 rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${sizePct}%` }} />
          </div>
          <button
            type="button"
            aria-label="Tăng cỡ chữ"
            disabled={settings.fontSize >= READER_FONT_MAX}
            onClick={() => update({ fontSize: settings.fontSize + 1 })}
            className={cn(sizeButton, 'text-[17px]')}
          >
            A+
          </button>
        </div>
      </Field>

      <Field label="Giãn dòng">
        <div
          role="radiogroup"
          aria-label="Giãn dòng"
          onKeyDown={onRadioKeys}
          className="grid grid-cols-3 rounded-md bg-secondary p-[3px]"
        >
          {LINE_SPACING.map((s) => {
            const on = settings.lineHeight === s.value;
            return (
              <button
                key={s.label}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => update({ lineHeight: s.value })}
                className={cn(
                  'h-8 rounded-[6px] text-small font-medium transition-colors',
                  focusRing,
                  on ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

interface MenuProps extends PanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The toolbar's "Aa" button with the settings: a popover under the button from sm (board), a bottom
 * Sheet on phones (decision 3).
 */
export function ReaderSettingsMenu({ open, onOpenChange, settings, update }: MenuProps) {
  const desktop = useMediaQuery('(min-width: 640px)');
  const trigger = (
    <button type="button" aria-label="Cài đặt đọc" className={cn(toolbarButton, 'min-w-11 font-serif text-[16px] font-semibold')}>
      Aa
    </button>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" sideOffset={12} aria-label="Cài đặt đọc" className="w-[340px] rounded-lg p-5">
          <ReaderSettingsPanel settings={settings} update={update} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="gap-0 rounded-t-xl px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        <SheetHeader className="px-0 pt-3 pb-4">
          <SheetTitle className="font-serif text-title-3">Cài đặt đọc</SheetTitle>
          <SheetDescription className="sr-only">Nền đọc, cỡ chữ và giãn dòng của trang đọc.</SheetDescription>
        </SheetHeader>
        <ReaderSettingsPanel settings={settings} update={update} />
      </SheetContent>
    </Sheet>
  );
}
