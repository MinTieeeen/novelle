import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { SubmitButton } from '@/components/common/SubmitButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { cn } from '@/lib/utils';
import { ADMIN_MSG, genreSchema, tagNameSchema, type AdminGenre, type AdminTag, type GenreValues } from '@/types/admin';
import { tagSlug } from '@/types/studio';
import { formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';
import { toastAdminError } from '@/hooks/useAdminActions';
import { ICON_BTN, ROW_BTN, TABLE, TABLE_HEAD } from './adminStyles';

const GENRE_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_200px_110px_160px] lg:items-center lg:gap-4 lg:px-5';
const TAG_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_110px_160px] lg:items-center lg:gap-4 lg:px-5';

/** Thể loại table (board AdminCatalog): name (+ order, description), slug, stories, Sửa / Xoá. */
export function GenreTable({ genres, onEdit, onDelete }: { genres: AdminGenre[]; onEdit: (g: AdminGenre) => void; onDelete: (g: AdminGenre) => void }) {
  return (
    <section aria-label="Thể loại" className={TABLE}>
      <div className={cn(TABLE_HEAD, GENRE_GRID)}>
        <span>Thể loại</span>
        <span>Slug</span>
        <span>Số truyện</span>
        <span />
      </div>
      <ul>
        {genres.map((g) => (
          <li key={g.genreId} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-label first:border-t-0 lg:first:border-t', GENRE_GRID)}>
            <span className="flex min-w-0 basis-full flex-col lg:basis-auto">
              <span className="font-semibold">
                <span className="num mr-2 text-caption font-normal text-muted-foreground">#{g.sortOrder}</span>
                {g.name}
              </span>
              {g.description && <span className="truncate text-small text-muted-foreground">{g.description}</span>}
            </span>
            <span className="truncate font-mono text-small text-muted-foreground">{g.slug}</span>
            <span className="num">
              {formatNumber(g.storyCount)}
              <span className="lg:hidden"> truyện</span>
            </span>
            <div className="flex items-center justify-end gap-2 max-lg:ml-auto">
              <button type="button" onClick={() => onEdit(g)} className={ROW_BTN}>
                <Pencil aria-hidden className="mr-1.5 size-3.5" strokeWidth={1.75} /> Sửa
              </button>
              <button type="button" onClick={() => onDelete(g)} aria-label={`Xoá thể loại ${g.name}`} title="Xoá thể loại" className={cn(ICON_BTN, 'text-destructive')}>
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tag table: #name, stories, Đổi tên / Xoá. */
export function TagTable({ tags, onRename, onDelete }: { tags: AdminTag[]; onRename: (t: AdminTag) => void; onDelete: (t: AdminTag) => void }) {
  return (
    <section aria-label="Tag" className={TABLE}>
      <div className={cn(TABLE_HEAD, TAG_GRID)}>
        <span>Tag</span>
        <span>Số truyện</span>
        <span />
      </div>
      {tags.length === 0 ? (
        <p className="border-t border-border px-5 py-12 text-center text-muted-foreground">Không có tag nào khớp.</p>
      ) : (
        <ul>
          {tags.map((t) => (
            <li key={t.tagId} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-label first:border-t-0 lg:first:border-t', TAG_GRID)}>
              <span className="min-w-0">
                <span className="inline-flex h-7 items-center rounded-full bg-accent px-3 font-medium text-primary">#{t.name}</span>
              </span>
              <span className="num">
                {formatNumber(t.usageCount)}
                <span className="lg:hidden"> truyện</span>
              </span>
              <div className="flex items-center justify-end gap-2 max-lg:ml-auto">
                <button type="button" onClick={() => onRename(t)} className={ROW_BTN}>
                  <Pencil aria-hidden className="mr-1.5 size-3.5" strokeWidth={1.75} /> Đổi tên
                </button>
                <button type="button" onClick={() => onDelete(t)} aria-label={`Xoá tag ${t.name}`} title="Xoá tag" className={cn(ICON_BTN, 'text-destructive')}>
                  <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface GenreFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined = create */
  genre?: AdminGenre;
  nextOrder: number;
  onSubmit: (v: GenreValues) => Promise<unknown>;
}

/**
 * "Thêm / Sửa thể loại" (board AdminCatalog): name, description, order; the slug is made by the server from
 * the name on creation and never changes, so it is shown read-only (decision E).
 */
export function GenreFormDialog({ open, onOpenChange, genre, nextOrder, onSubmit }: GenreFormDialogProps) {
  const form = useForm<GenreValues>({ resolver: zodResolver(genreSchema), defaultValues: { name: '', description: '', sortOrder: nextOrder } });
  const name = useWatch({ control: form.control, name: 'name' }) ?? '';
  const pending = form.formState.isSubmitting;
  const returnFocus = useReturnFocus(open);
  useEffect(() => {
    if (open) form.reset({ name: genre?.name ?? '', description: genre?.description ?? '', sortOrder: genre?.sortOrder ?? nextOrder });
  }, [open, genre, nextOrder, form]);

  async function submit(v: GenreValues) {
    try {
      await onSubmit(v);
      onOpenChange(false);
    } catch (e) {
      const shown = applyApiError(form, e, {
        codes: { GENRE_NAME_TAKEN: { field: 'name', message: ADMIN_MSG.genreTaken } },
        fieldMessages: { name: ADMIN_MSG.genreName, description: ADMIN_MSG.genreDescription, sortOrder: ADMIN_MSG.sortOrder },
      });
      if (!shown) toastAdminError(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[480px] gap-5 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">{genre ? 'Sửa thể loại' : 'Thêm thể loại'}</DialogTitle>
          <DialogDescription>Thể loại hiện ở bộ lọc, thanh thể loại và biểu mẫu tạo truyện.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên thể loại</FormLabel>
                  <FormControl>
                    <Input placeholder="Ví dụ: Huyền huyễn" maxLength={60} autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="genre-slug">Slug</Label>
              <Input id="genre-slug" value={genre?.slug ?? tagSlug(name)} readOnly aria-readonly className="bg-secondary font-mono text-small" />
              <span className="text-small text-muted-foreground">
                {genre ? 'Slug giữ nguyên để không đổi đường dẫn đã có.' : 'Tạo tự động từ tên, dùng trong đường dẫn.'}
              </span>
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Mô tả <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Controller
              control={form.control}
              name="sortOrder"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Thứ tự hiển thị</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={32000}
                      value={Number.isNaN(field.value) ? '' : field.value}
                      onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
                      className="w-[140px]"
                      aria-invalid={!!fieldState.error || undefined}
                    />
                  </FormControl>
                  <FormDescription>Số nhỏ hiện trước.</FormDescription>
                  {fieldState.error && <p className="text-small text-destructive">{fieldState.error.message}</p>}
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <SubmitButton pending={pending} pendingLabel="Đang lưu…">
                Lưu thể loại
              </SubmitButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** "Không xoá được “…”" (board AdminCatalog): GENRE_IN_USE with the number of stories. */
export function GenreBlockedDialog({ genre, onClose }: { genre: AdminGenre | null; onClose: () => void }) {
  const returnFocus = useReturnFocus(genre !== null);
  return (
    <Dialog open={genre !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[460px] gap-4 sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">Không xoá được “{genre?.name}”</DialogTitle>
          <DialogDescription>Thể loại đang được dùng nên hệ thống từ chối thao tác.</DialogDescription>
        </DialogHeader>
        <div role="alert" className="flex items-start gap-3 rounded-md bg-warning-soft px-4 py-3 text-label text-nghe-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={1.75} />
          <span>
            Thể loại này đang được <b>{formatNumber(genre?.storyCount ?? 0)}</b> truyện sử dụng (kể cả truyện đã xoá). Hãy chuyển các truyện sang thể loại khác trước.
          </span>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Đã hiểu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TagRenameDialogProps {
  tag: AdminTag | null;
  onClose: () => void;
  /** T2; rejects with ApiError (TAG_NAME_TAKEN under the field) */
  onSubmit: (name: string) => Promise<unknown>;
}

/** "Đổi tên tag" (board AdminCatalog): applies to every story using it. */
export function TagRenameDialog({ tag, onClose, onSubmit }: TagRenameDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const returnFocus = useReturnFocus(tag !== null);
  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setError(null);
    }
  }, [tag]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = tagNameSchema.safeParse(name);
    if (!r.success) {
      setError(r.error.issues[0].message);
      return;
    }
    setPending(true);
    try {
      await onSubmit(r.data);
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const inline = code === 'TAG_NAME_TAKEN' ? ADMIN_MSG.tagTaken : code === 'VALIDATION_FAILED' ? ADMIN_MSG.tagName : null;
      setError(inline);
      if (!inline) toastAdminError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={tag !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-w-[440px] gap-4 sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">Đổi tên tag</DialogTitle>
          <DialogDescription>
            Tag “{tag?.name}” đang dùng ở {formatNumber(tag?.usageCount ?? 0)} truyện.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-name">Tên tag mới</Label>
            <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error || undefined} maxLength={60} autoComplete="off" />
            {error ? (
              <p role="alert" className="text-small text-destructive">
                {error}
              </p>
            ) : (
              <span className="text-small text-muted-foreground">Đổi tên áp dụng cho tất cả truyện đang dùng tag này.</span>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Huỷ
            </Button>
            <SubmitButton pending={pending} pendingLabel="Đang lưu…">
              Đổi tên
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
