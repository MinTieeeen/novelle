import { vi } from 'date-fns/locale';
import { CalendarClock, Loader2, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { scheduleError, type ChapterStatus } from '@/types/studio';
import { formatDateTime, vnLocalToUtcIso } from '@/utils/format';
import { FOCUS } from './studioStyles';

interface PublishPopoverProps {
  status: ChapterStatus;
  scheduledAt?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** C7 (the page saves first when there are changes) */
  onPublishNow: () => void;
  /** C8 with a UTC ISO instant */
  onSchedule: (iso: string) => void;
  /** C9 */
  onUnschedule: () => void;
  pending?: boolean;
  disabled?: boolean;
}

/** Tomorrow 20:00 in Vietnam: the board's default schedule. */
function defaultDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * "Xuất bản" (board ChapterEditor, panel Xuất bản): radiogroup Xuất bản ngay / Xuất bản theo lịch; the
 * second shows a month calendar (Monday first, Vietnamese) and a time, read as Vietnam time and checked
 * like C8 (≥ now + 1 min, ≤ 365 days). A scheduled chapter shows its time and "Huỷ hẹn giờ".
 */
export function PublishPopover({ status, scheduledAt, open, onOpenChange, onPublishNow, onSchedule, onUnschedule, pending, disabled }: PublishPopoverProps) {
  const [mode, setMode] = useState<'now' | 'later'>(status === 'SCHEDULED' ? 'later' : 'now');
  const [date, setDate] = useState<Date | undefined>(() => (scheduledAt ? new Date(scheduledAt) : defaultDate()));
  const [time, setTime] = useState('20:00');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(status === 'SCHEDULED' ? 'later' : 'now');
    setTouched(false);
    if (scheduledAt) {
      setDate(new Date(scheduledAt));
      setTime(formatDateTime(scheduledAt).slice(-5));
    }
  }, [open, status, scheduledAt]);

  const iso = useMemo(() => (date ? vnLocalToUtcIso(date, time) : ''), [date, time]);
  const error = mode === 'later' ? (iso ? scheduleError(iso) : 'Chọn ngày đăng.') : null;
  const today = new Date();
  const maxDay = new Date(today.getTime() + 365 * 86_400_000);

  const confirm = () => {
    setTouched(true);
    if (mode === 'now') onPublishNow();
    else if (!error) onSchedule(iso);
  };

  if (status === 'PUBLISHED') {
    return (
      <Button disabled className="font-semibold">
        Đã xuất bản
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button disabled={disabled} className="font-semibold">
          {status === 'SCHEDULED' ? <CalendarClock strokeWidth={1.75} /> : <Send strokeWidth={1.75} />}
          {status === 'SCHEDULED' ? 'Đã hẹn giờ' : 'Xuất bản'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Xuất bản chương" collisionPadding={12}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[340px] flex-col gap-3 overflow-y-auto rounded-lg p-4">
        <span className="font-serif text-[17px] leading-6 font-semibold">Xuất bản chương</span>
        {status === 'SCHEDULED' && scheduledAt && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-label text-nghe-ink">
            Đang hẹn đăng lúc <b>{formatDateTime(scheduledAt)}</b> (giờ Việt Nam).
          </p>
        )}
        <div role="radiogroup" aria-label="Thời điểm xuất bản" className="flex flex-col gap-1.5">
          {(
            [
              ['now', 'Xuất bản ngay', 'Người đọc thấy chương ngay lập tức'],
              ['later', status === 'SCHEDULED' ? 'Đổi lịch' : 'Xuất bản theo lịch', 'Chọn ngày và giờ đăng (giờ Việt Nam)'],
            ] as const
          ).map(([value, label, hint]) => {
            const on = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(value)}
                className={cn('flex items-start gap-3 rounded-md border px-3 py-2.5 text-left', FOCUS, on ? 'border-primary bg-accent' : 'border-input hover:bg-secondary')}
              >
                <span aria-hidden className={cn('mt-1 grid size-4 flex-none place-items-center rounded-full border-2', on ? 'border-primary' : 'border-input')}>
                  {on && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-label font-semibold">{label}</span>
                  <span className="text-small text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {mode === 'later' && (
          <div className="flex flex-col gap-2">
            <Calendar
              mode="single"
              locale={vi}
              weekStartsOn={1}
              selected={date}
              onSelect={setDate}
              disabled={{ before: new Date(today.getFullYear(), today.getMonth(), today.getDate()), after: maxDay }}
              className="rounded-md border border-border p-2"
            />
            <div className="flex items-center gap-3">
              <Label htmlFor="publish-time" className="shrink-0">
                Giờ đăng
              </Label>
              <Input id="publish-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[130px]" aria-invalid={(touched && !!error) || undefined} />
            </div>
            {touched && error && (
              <p role="alert" className="text-small text-destructive">
                {error}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {status === 'SCHEDULED' && (
            <Button variant="ghost" onClick={onUnschedule} disabled={pending} className="mr-auto text-destructive hover:text-destructive">
              Huỷ hẹn giờ
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Huỷ
          </Button>
          <Button onClick={confirm} disabled={pending} className="font-semibold">
            {pending && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
            {mode === 'now' ? 'Xuất bản ngay' : status === 'SCHEDULED' ? 'Lưu lịch mới' : 'Hẹn giờ đăng'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
