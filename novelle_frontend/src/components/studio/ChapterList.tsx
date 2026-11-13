import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/types/story';
import { STUDIO_MSG, summarizeChapters, volumeSchema, type ChapterListItem, type Volume, type VolumeValues } from '@/types/studio';
import { formatNumber, formatRelative } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';
import { ChapterStatusBadge } from './StudioBadges';
import { FOCUS } from './studioStyles';

const ROW = 'lg:grid lg:grid-cols-[minmax(0,1fr)_200px_96px_120px_84px] lg:items-center lg:gap-4';
const ICON_BTN = cn('grid size-[34px] flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent', FOCUS);

interface ChapterListProps {
  storyId: number;
  volumes: Volume[];
  chapters: ChapterListItem[];
  /** C2 then open the editor; `volumeId` = the volume the button was in */
  onCreateChapter: (volumeId: number | null) => void;
  creating?: boolean;
  onCreateVolume: () => void;
  onRenameVolume: (v: Volume) => void;
  onDeleteVolume: (v: Volume) => void;
  onDeleteChapter: (c: ChapterListItem) => void;
}

interface Group {
  key: string;
  volume: Volume | null;
  chapters: ChapterListItem[];
}

/**
 * "Chương & tập" of S3 (board ChapterList): summary line, "Tạo tập" / "Tạo chương", one collapsible group
 * per volume (rename, delete when empty), loose chapters last; each chapter: number + title (editor link),
 * status, words, last change, edit / delete. The volume with the newest chapter starts open.
 */
export function ChapterList(props: ChapterListProps) {
  const { storyId, volumes, chapters, onCreateChapter, creating, onCreateVolume, onRenameVolume, onDeleteVolume, onDeleteChapter } = props;

  const groups = useMemo<Group[]>(() => {
    const byNo = (a: ChapterListItem, b: ChapterListItem) => a.chapterNo - b.chapterNo;
    const out: Group[] = volumes.map((v) => ({ key: `v${v.volumeId}`, volume: v, chapters: chapters.filter((c) => c.volumeId === v.volumeId).sort(byNo) }));
    const known = new Set(volumes.map((v) => v.volumeId));
    const loose = chapters.filter((c) => c.volumeId == null || !known.has(c.volumeId)).sort(byNo);
    if (loose.length > 0 || volumes.length === 0) out.push({ key: 'loose', volume: null, chapters: loose });
    return out;
  }, [volumes, chapters]);

  const [open, setOpen] = useState<Set<string>>(() => {
    const newest = [...chapters].sort((a, b) => b.chapterNo - a.chapterNo)[0];
    const key = newest ? (groups.find((g) => g.chapters.includes(newest))?.key ?? groups[0]?.key) : groups.at(-1)?.key;
    return new Set(key ? [key] : []);
  });
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const editor = (c: ChapterListItem) => `/studio/stories/${storyId}/chapters/${c.chapterId}`;

  return (
    <section aria-label="Chương và tập" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{summarizeChapters(chapters, volumes.length)}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCreateVolume}>
            <FolderPlus strokeWidth={1.75} /> Tạo tập
          </Button>
          <Button onClick={() => onCreateChapter(volumes.at(-1)?.volumeId ?? null)} disabled={creating} className="font-semibold">
            <Plus strokeWidth={1.75} /> Tạo chương
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {groups.map((g, gi) => {
          const isOpen = open.has(g.key) || groups.length === 1;
          const panel = `ch-${g.key}`;
          const v = g.volume;
          return (
            <div key={g.key} className={cn(gi > 0 && 'border-t border-border')}>
              <div className="flex items-center gap-2 bg-secondary py-1.5 pr-3 pl-1">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => toggle(g.key)}
                  className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-left', FOCUS)}
                >
                  <ChevronDown aria-hidden strokeWidth={1.75} className={cn('size-4 flex-none text-muted-foreground transition-transform', !isOpen && '-rotate-90')} />
                  <span className="truncate font-semibold">{v ? `Tập ${v.volumeNo} · ${v.title}` : volumes.length ? 'Chương lẻ' : 'Danh sách chương'}</span>
                  <span className="num flex-none text-small text-muted-foreground">{formatNumber(g.chapters.length)} chương</span>
                </button>
                {v && (
                  <>
                    <button type="button" aria-label={`Đổi tên tập ${v.volumeNo}`} onClick={() => onRenameVolume(v)} className={ICON_BTN}>
                      <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Xoá tập ${v.volumeNo}`}
                      title={v.chapterCount > 0 ? 'Chỉ xoá được tập không còn chương' : undefined}
                      disabled={v.chapterCount > 0}
                      onClick={() => onDeleteVolume(v)}
                      className={ICON_BTN}
                    >
                      <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </div>
              {isOpen && (
                <div id={panel}>
                  {g.chapters.length === 0 ? (
                    <p className="border-t border-border px-5 py-4 text-label text-muted-foreground">
                      {v ? 'Tập chưa có chương nào.' : 'Truyện chưa có chương nào. Bấm “Tạo chương” để viết chương đầu tiên.'}
                    </p>
                  ) : (
                    <ol>
                      {g.chapters.map((c) => (
                        <li key={c.chapterId} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-4 py-2.5 text-label lg:px-5', ROW)}>
                          <Link to={editor(c)} className="min-w-0 truncate font-medium hover:text-primary max-lg:basis-full">
                            {chapterLabel(c)}
                          </Link>
                          <span>
                            <ChapterStatusBadge status={c.status} scheduledAt={c.scheduledAt} />
                          </span>
                          <span className="num text-muted-foreground">{formatNumber(c.wordCount)} chữ</span>
                          <span className="text-muted-foreground">{formatRelative(c.updatedAt)}</span>
                          <div className="flex justify-end gap-1 max-lg:ml-auto">
                            <Link to={editor(c)} aria-label={`Sửa chương ${c.chapterNo}`} className={ICON_BTN}>
                              <Pencil aria-hidden className="size-4" strokeWidth={1.75} />
                            </Link>
                            <button type="button" aria-label={`Xoá chương ${c.chapterNo}`} onClick={() => onDeleteChapter(c)} className={ICON_BTN}>
                              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  {v && (
                    <div className="border-t border-border px-3 py-1.5">
                      <Button variant="ghost" size="sm" disabled={creating} onClick={() => onCreateChapter(v.volumeId)} className="text-link">
                        <Plus strokeWidth={1.75} /> Thêm chương vào tập này
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface VolumeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined = create (shows the next number) */
  volume?: Volume;
  nextNo: number;
  /** V2 / V3; rejects with ApiError */
  onSubmit: (title: string) => Promise<unknown>;
}

/** "Tạo tập mới" / "Đổi tên tập" (board ChapterList dialog): one field, ≤ 200 characters. */
export function VolumeFormDialog({ open, onOpenChange, volume, nextNo, onSubmit }: VolumeFormDialogProps) {
  const form = useForm<VolumeValues>({ resolver: zodResolver(volumeSchema), defaultValues: { title: '' } });
  const returnFocus = useReturnFocus(open);
  const pending = form.formState.isSubmitting;
  useEffect(() => {
    if (open) form.reset({ title: volume?.title ?? '' });
  }, [open, volume, form]);

  async function submit(v: VolumeValues) {
    try {
      await onSubmit(v.title);
      onOpenChange(false);
    } catch (e) {
      applyApiError(form, e, { fieldMessages: { title: STUDIO_MSG.volumeTitle } });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[440px] gap-4 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">{volume ? `Đổi tên tập ${volume.volumeNo}` : 'Tạo tập mới'}</DialogTitle>
          <DialogDescription className="sr-only">Tên tập hiện trong mục lục của truyện.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên tập</FormLabel>
                  <FormControl>
                    <Input placeholder="Ví dụ: Mùa nước lên" autoComplete="off" maxLength={220} {...field} />
                  </FormControl>
                  {!volume && <FormDescription>Tập {nextNo} sẽ được thêm vào cuối danh sách.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <SubmitButton pending={pending} pendingLabel="Đang lưu…">
                {volume ? 'Lưu' : 'Tạo tập'}
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
