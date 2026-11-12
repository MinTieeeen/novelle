import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Plus, Star, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { getTags } from '@/api/catalog';
import { queryKeys } from '@/api/queryKeys';
import { SubmitButton } from '@/components/common/SubmitButton';
import { StoryCover } from '@/components/story/StoryCover';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import type { Genre } from '@/types/story';
import {
  addTag,
  AGE_OPTIONS,
  COMPLETION_OPTIONS,
  EMPTY_STORY,
  GENRES_MAX,
  STORY_DESCRIPTION_MAX,
  STORY_TITLE_MAX,
  storySchema,
  STUDIO_MSG,
  tagSlug,
  TAGS_MAX,
  type StoryValues,
} from '@/types/studio';
import { formatNumber } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';
import { CoverPickerDialog, GenreSelectDialog } from './StoryPickers';
import { FOCUS, PILL, PILL_OFF, PILL_ON } from './studioStyles';


interface StoryFormProps {
  mode: 'create' | 'edit';
  defaultValues?: StoryValues;
  genres: Genre[];
  /** pen name printed on the cover preview */
  penName: string;
  storyId?: number;
  /** S2, or S4 + S5 + S6; rejects with ApiError (VALIDATION_FAILED goes to the fields) */
  onSubmit: (values: StoryValues) => Promise<unknown>;
  /** S4 answered STALE_DATA: show the alert with "Tải lại" */
  conflict?: boolean;
  onReload?: () => void;
  cancelTo: string;
  cooldown?: number;
}

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <span className={cn('num text-small', n > max ? 'text-destructive' : 'text-muted-foreground')}>
      {formatNumber(n)}/{formatNumber(max)}
    </span>
  );
}

/** Tag chips + input (Enter or comma adds, Backspace on empty removes the last), with suggestions from /tags. */
function TagInput({ value, onChange, invalid }: { value: string[]; onChange: (tags: string[]) => void; invalid?: boolean }) {
  const [text, setText] = useState('');
  const q = useDebounce(text.trim(), 250);
  const suggestions = useQuery({
    queryKey: queryKeys.tags(q),
    queryFn: ({ signal }) => getTags(q, 6, signal),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
  });
  const shown = (suggestions.data ?? []).filter((t) => !value.some((v) => tagSlug(v) === t.slug));
  const full = value.length >= TAGS_MAX;

  const add = (raw: string) => {
    const next = addTag(value, raw);
    if (next !== value) onChange(next);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Enter') e.preventDefault();
    else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tag đã chọn">
          {value.map((t) => (
            <li key={t} className="inline-flex h-[30px] items-center gap-1 rounded-full bg-accent pr-1 pl-3 text-small font-medium text-primary">
              #{t}
              <button
                type="button"
                aria-label={`Bỏ tag ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
                className={cn('grid size-6 place-items-center rounded-full hover:bg-primary/10', FOCUS)}
              >
                <X aria-hidden className="size-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text.trim() && add(text)}
        placeholder={full ? 'Đã đủ 10 tag' : 'Nhập tag rồi nhấn Enter'}
        aria-label="Thêm tag"
        aria-invalid={invalid || undefined}
        disabled={full}
        maxLength={60}
      />
      {shown.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5 text-small">
          <span className="text-muted-foreground">Gợi ý:</span>
          {shown.map((t) => (
            <button
              key={t.tagId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t.name)}
              className={cn('rounded-full border border-input px-2.5 py-0.5 hover:bg-secondary', FOCUS)}
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}
      <span className="num text-small text-muted-foreground">
        {value.length}/{TAGS_MAX} tag.
      </span>
    </div>
  );
}

/**
 * Story form (board StoryForm): title /300, description /4000, age and status pills, 1–3 genres with a
 * primary star, up to 10 tags, the cover on the right ("Chọn bìa" from the primary genre's covers).
 * Errors under the fields. Edit mode shows the STALE_DATA alert.
 */
export function StoryForm({ mode, defaultValues, genres, penName, storyId = 0, onSubmit, conflict, onReload, cancelTo, cooldown = 0 }: StoryFormProps) {
  const form = useForm<StoryValues>({ resolver: zodResolver(storySchema), defaultValues: defaultValues ?? EMPTY_STORY });
  const [title, description, genreIds, primaryGenreId, coverUrl] = useWatch({
    control: form.control,
    name: ['title', 'description', 'genreIds', 'primaryGenreId', 'coverUrl'],
  });
  const [genresOpen, setGenresOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const pending = form.formState.isSubmitting;

  useEffect(() => {
    if (defaultValues) form.reset(defaultValues);
  }, [defaultValues, form]);

  const byId = new Map(genres.map((g) => [g.genreId, g]));
  const primary = byId.get(primaryGenreId);
  const genreError = form.formState.errors.genreIds?.message ?? form.formState.errors.primaryGenreId?.message;

  const setGenres = (ids: number[]) => {
    form.setValue('genreIds', ids, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    const nextPrimary = ids.includes(primaryGenreId) ? primaryGenreId : (ids[0] ?? 0);
    if (nextPrimary !== primaryGenreId) {
      form.setValue('primaryGenreId', nextPrimary, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
      // The covers belong to the primary genre: a new primary genre resets the chosen cover.
      if (coverUrl) form.setValue('coverUrl', '', { shouldDirty: true });
    }
  };

  async function submit(values: StoryValues) {
    try {
      await onSubmit(values);
    } catch (e) {
      applyApiError(form, e, {
        fieldMessages: {
          title: STUDIO_MSG.storyTitle,
          description: STUDIO_MSG.description,
          genreIds: STUDIO_MSG.genres,
          primaryGenreId: STUDIO_MSG.primaryGenre,
          tags: STUDIO_MSG.tags,
        },
      });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        noValidate
        aria-label={mode === 'create' ? 'Tạo truyện' : 'Thông tin truyện'}
        className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_260px]"
      >
        <div className="flex min-w-0 flex-col gap-6">
          {conflict && (
            <div role="alert" className="flex items-start gap-3 rounded-md bg-warning-soft px-4 py-3.5 text-nghe-ink">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={1.75} />
              <div className="flex flex-1 flex-col gap-2">
                <div>
                  <b>Thông tin truyện đã được sửa ở nơi khác</b>
                  <p className="text-label">Bản trên máy chủ mới hơn bản bạn đang sửa. Tải lại để lấy bản mới nhất trước khi lưu.</p>
                </div>
                {onReload && (
                  <Button type="button" size="sm" variant="outline" className="self-start" onClick={onReload}>
                    Tải lại
                  </Button>
                )}
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tiêu đề</FormLabel>
                <FormControl>
                  <Input placeholder="Ví dụ: Người Gác Đèn Trên Sông Hương" maxLength={STORY_TITLE_MAX + 20} {...field} />
                </FormControl>
                <div className="flex justify-between gap-3">
                  <FormMessage />
                  <span className="ml-auto">
                    <Counter n={title?.trim().length ?? 0} max={STORY_TITLE_MAX} />
                  </span>
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mô tả</FormLabel>
                <FormControl>
                  <Textarea rows={5} placeholder="Truyện kể về điều gì?" className="resize-y" {...field} />
                </FormControl>
                <div className="flex justify-between gap-3">
                  <FormMessage />
                  <span className="ml-auto">
                    <Counter n={description?.trim().length ?? 0} max={STORY_DESCRIPTION_MAX} />
                  </span>
                </div>
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ['ageRating', 'Độ tuổi', AGE_OPTIONS],
                ['completionStatus', 'Tình trạng', COMPLETION_OPTIONS],
              ] as const
            ).map(([name, label, options]) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <div className="flex flex-col gap-2" role="group" aria-labelledby={`f-${name}`}>
                    <span id={`f-${name}`} className="text-label font-semibold">
                      {label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={field.value === o.value}
                          onClick={() => field.onChange(o.value)}
                          className={cn(PILL, field.value === o.value ? PILL_ON : PILL_OFF)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              />
            ))}
          </div>

          <div className="flex flex-col gap-2" role="group" aria-labelledby="f-genres">
            <span id="f-genres" className="text-label font-semibold">
              Thể loại
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {genreIds.map((id) => {
                const g = byId.get(id);
                const isMain = id === primaryGenreId;
                return (
                  <span key={id} className="inline-flex h-[34px] items-center gap-1 rounded-full bg-primary pr-1.5 pl-3 text-label font-medium text-primary-foreground">
                    {g?.name ?? `#${id}`}
                    <button
                      type="button"
                      aria-pressed={isMain}
                      aria-label={`Đặt ${g?.name ?? ''} làm thể loại chính`}
                      title={isMain ? 'Thể loại chính' : 'Đặt làm thể loại chính'}
                      onClick={() => {
                        if (isMain) return;
                        form.setValue('primaryGenreId', id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
                        if (coverUrl) form.setValue('coverUrl', '', { shouldDirty: true });
                      }}
                      className={cn('grid size-6 place-items-center rounded-full hover:bg-white/15', FOCUS)}
                    >
                      <Star aria-hidden strokeWidth={1.75} className={cn('size-4', isMain ? 'fill-nghe text-nghe' : 'text-primary-foreground/60')} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Bỏ ${g?.name ?? ''}`}
                      onClick={() => setGenres(genreIds.filter((x) => x !== id))}
                      className={cn('grid size-6 place-items-center rounded-full hover:bg-white/15', FOCUS)}
                    >
                      <X aria-hidden className="size-3.5" strokeWidth={2} />
                    </button>
                  </span>
                );
              })}
              {genreIds.length < GENRES_MAX && (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setGenresOpen(true)}
                  className={cn(
                    'inline-flex h-[34px] items-center gap-1.5 rounded-full border border-dashed px-3 text-label font-medium text-link hover:bg-secondary',
                    genreError ? 'border-destructive' : 'border-input',
                    FOCUS,
                  )}
                >
                  <Plus aria-hidden className="size-4" strokeWidth={1.75} /> Thêm thể loại
                </button>
              )}
            </div>
            {genreError ? (
              <p role="alert" className="text-small text-destructive">
                {genreError}
              </p>
            ) : (
              <span className="text-small text-muted-foreground">Chọn 1–3 thể loại. Bấm ngôi sao để đặt thể loại chính.</span>
            )}
          </div>

          <Controller
            control={form.control}
            name="tags"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2" role="group" aria-labelledby="f-tags">
                <span id="f-tags" className="text-label font-semibold">
                  Tag
                </span>
                <TagInput value={field.value} onChange={field.onChange} invalid={!!fieldState.error} />
                {fieldState.error && (
                  <p role="alert" className="text-small text-destructive">
                    {STUDIO_MSG.tags}
                  </p>
                )}
              </div>
            )}
          />

          <div className="flex gap-2 pt-2">
            <SubmitButton pending={pending} pendingLabel={mode === 'create' ? 'Đang tạo…' : 'Đang lưu…'} cooldown={cooldown}>
              {mode === 'create' ? 'Tạo truyện' : 'Lưu thay đổi'}
            </SubmitButton>
            <Button variant="outline" asChild>
              <Link to={cancelTo}>Huỷ</Link>
            </Button>
          </div>
        </div>

        <aside aria-label="Bìa truyện" className="flex flex-col gap-3 max-xl:row-start-1">
          <span className="text-label font-semibold">Ảnh bìa</span>
          <div className="flex gap-4 max-xl:items-end xl:flex-col xl:gap-3">
            {(['md', 'lg'] as const).map((size) => (
              <StoryCover
                key={size}
                storyId={storyId}
                title={title?.trim() || 'Tên truyện'}
                penName={penName}
                coverUrl={coverUrl || null}
                size={size}
                className={size === 'md' ? 'w-[120px] flex-none xl:hidden' : 'max-xl:hidden'}
              />
            ))}
            <div className="flex flex-col gap-2 xl:gap-3">
              <Button type="button" variant="outline" className="w-full max-xl:w-fit" aria-haspopup="dialog" onClick={() => setCoverOpen(true)}>
                <ImageIcon strokeWidth={1.75} /> Chọn bìa
              </Button>
              <span className="text-small text-muted-foreground">Bìa chọn từ bộ ảnh có sẵn theo thể loại chính.</span>
            </div>
          </div>
        </aside>

        <GenreSelectDialog open={genresOpen} onOpenChange={setGenresOpen} genres={genres} selected={genreIds} onApply={setGenres} />
        <CoverPickerDialog
          open={coverOpen}
          onOpenChange={setCoverOpen}
          genre={primary}
          value={coverUrl}
          preview={{ storyId, title: title?.trim() || 'Tên truyện', penName }}
          onApply={(url) => form.setValue('coverUrl', url, { shouldDirty: true })}
        />
      </form>
    </Form>
  );
}
