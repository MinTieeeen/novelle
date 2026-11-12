import { Check, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StoryCover } from '@/components/story/StoryCover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { cn } from '@/lib/utils';
import type { Genre } from '@/types/story';
import { coverUrls, GENRES_MAX } from '@/types/studio';
import { FOCUS } from './studioStyles';

interface GenreSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genres: Genre[];
  selected: number[];
  onApply: (genreIds: number[]) => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * "Chọn thể loại" (StoryForm board): search, checkbox list, at most 3 ("Đã chọn N/3"); the others are
 * disabled once 3 are picked. "Xong" applies.
 */
export function GenreSelectDialog({ open, onOpenChange, genres, selected, onApply }: GenreSelectDialogProps) {
  const [picked, setPicked] = useState<number[]>(selected);
  const [q, setQ] = useState('');
  const returnFocus = useReturnFocus(open);
  useEffect(() => {
    if (open) {
      setPicked(selected);
      setQ('');
    }
  }, [open, selected]);

  const shown = useMemo(() => genres.filter((g) => fold(g.name).includes(fold(q.trim()))), [genres, q]);
  const full = picked.length >= GENRES_MAX;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus} className="flex max-h-[min(640px,calc(100dvh-32px))] max-w-[440px] flex-col gap-4 p-0 sm:max-w-[440px]">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="font-serif text-title-3">Chọn thể loại</DialogTitle>
          <DialogDescription>Chọn từ 1 đến 3 thể loại.</DialogDescription>
        </DialogHeader>
        <div className="relative px-5">
          <Search aria-hidden className="pointer-events-none absolute top-2.5 left-8 size-4 text-muted-foreground" strokeWidth={1.75} />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm thể loại" aria-label="Tìm thể loại" className="pl-9" />
        </div>
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto px-3">
          {shown.map((g) => {
            const on = picked.includes(g.genreId);
            const disabled = !on && full;
            return (
              <li key={g.genreId}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-label transition-colors hover:bg-secondary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid',
                    disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    disabled={disabled}
                    onChange={() => setPicked((p) => (on ? p.filter((x) => x !== g.genreId) : [...p, g.genreId]))}
                  />
                  <span
                    aria-hidden
                    className={cn('grid size-[18px] flex-none place-items-center rounded-[5px] border-[1.5px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card')}
                  >
                    {on && <Check className="size-3" strokeWidth={2.5} />}
                  </span>
                  {g.name}
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="col-span-2 px-2 py-4 text-label text-muted-foreground">Không có thể loại khớp.</li>}
        </ul>
        <DialogFooter className="flex-row items-center justify-between border-t border-border px-5 py-3 sm:justify-between">
          <span className="num text-label text-muted-foreground" aria-live="polite">
            Đã chọn {picked.length}/{GENRES_MAX}
          </span>
          <Button
            onClick={() => {
              onApply(picked);
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

interface CoverPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** slug of the primary genre; undefined → choose a genre first */
  genre?: { slug: string; name: string };
  value: string;
  onApply: (coverUrl: string) => void;
  preview: { storyId: number; title: string; penName: string };
}

/**
 * "Chọn bìa" (StoryForm board, decision 1): the 8 covers of the primary genre (/covers/<slug>/01…08.jpg).
 * An image that is not there yet shows the default cover. "Dùng bìa mặc định" clears the choice.
 */
export function CoverPickerDialog({ open, onOpenChange, genre, value, onApply, preview }: CoverPickerDialogProps) {
  const [picked, setPicked] = useState(value);
  const returnFocus = useReturnFocus(open);
  useEffect(() => {
    if (open) setPicked(value);
  }, [open, value]);
  const urls = genre ? coverUrls(genre.slug) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-h-[calc(100dvh-32px)] max-w-[640px] gap-4 overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">Chọn bìa</DialogTitle>
          <DialogDescription>{genre ? `Bìa theo thể loại chính: ${genre.name}` : 'Chọn thể loại chính trước để xem bìa.'}</DialogDescription>
        </DialogHeader>
        {genre && (
          <div role="group" aria-label="Bìa có sẵn" className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {urls.map((url, i) => {
              const on = picked === url;
              return (
                <button
                  key={url}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Bìa ${i + 1}`}
                  onClick={() => setPicked(url)}
                  className={cn('relative rounded-[4px] p-1 transition-colors', FOCUS, on ? 'bg-accent ring-2 ring-primary' : 'hover:bg-secondary')}
                >
                  <StoryCover storyId={preview.storyId + i} title={preview.title} penName={preview.penName} coverUrl={url} size="md" />
                  {on && (
                    <span aria-hidden className="absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              onApply('');
              onOpenChange(false);
            }}
          >
            Dùng bìa mặc định
          </Button>
          <div className="flex gap-2 max-sm:flex-col-reverse">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!genre || !picked}
              onClick={() => {
                onApply(picked);
                onOpenChange(false);
              }}
            >
              Dùng bìa này
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
