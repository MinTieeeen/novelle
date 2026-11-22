import { format, parse } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CalendarDays, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const ISO = 'yyyy-MM-dd';
const toDate = (v?: string) => (v ? parse(v, ISO, new Date()) : undefined);

interface AdminDateFieldProps {
  /** yyyy-MM-dd */
  value?: string;
  onChange: (value: string | undefined) => void;
  /** accessible name, e.g. "Đăng ký từ ngày" */
  label: string;
  placeholder: string;
  min?: string;
  max?: string;
}

/**
 * A date picker shown as dd/MM/yyyy whatever the browser language (a native date input follows the
 * browser locale): button + shadcn Calendar in a popover (Vietnamese, week starts Monday), × clears it.
 */
export function AdminDateField({ value, onChange, label, placeholder, min, max }: AdminDateFieldProps) {
  const [open, setOpen] = useState(false);
  const date = toDate(value);
  const today = new Date();
  return (
    <div className="relative inline-flex">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={date ? `${label}: ${format(date, 'dd/MM/yyyy')}` : label}
            className={cn('h-9 w-[150px] justify-start gap-2 font-normal', !date && 'text-muted-foreground', date && 'pr-9')}
          >
            <CalendarDays aria-hidden className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="num">{date ? format(date, 'dd/MM/yyyy') : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="single"
            locale={vi}
            weekStartsOn={1}
            selected={date}
            defaultMonth={date}
            onSelect={(d) => {
              onChange(d ? format(d, ISO) : undefined);
              setOpen(false);
            }}
            disabled={[{ after: toDate(max) ?? today }, ...(min ? [{ before: toDate(min)! }] : [])]}
          />
        </PopoverContent>
      </Popover>
      {date && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`Xoá ${label.toLowerCase()}`}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <X aria-hidden className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
