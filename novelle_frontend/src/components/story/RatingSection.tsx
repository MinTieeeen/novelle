import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Star } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { distributionRows, ratingSchema, REVIEW_MAX, type Rating, type RatingValues, type StoryRatings } from '@/types/rating';
import { formatDate, formatNumber, formatRating } from '@/utils/format';
import { applyApiError } from '@/utils/formErrors';

/** Who sees the "Đánh giá của bạn" column. */
export type RatingMode = 'form' | 'guest' | 'own-story' | 'admin';

interface RatingSectionProps {
  /** D1 first page + summary; undefined while loading */
  ratings?: StoryRatings;
  /** the extra pages loaded by "Xem thêm đánh giá" */
  moreReviews?: Rating[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  mode: RatingMode;
  /** my rating (D2), null = not rated yet */
  mine?: Rating | null;
  /** D3; rejects with ApiError */
  onSave?: (values: RatingValues) => Promise<unknown>;
  /** asks the page to confirm and run D4 */
  onDelete?: () => void;
  /** guests: open the login popup */
  onLogin?: () => void;
}

const LABELS = ['', 'Tệ', 'Chưa hay', 'Tạm được', 'Hay', 'Rất hay'];

/** 5 star radio buttons with arrow keys (roving tabindex), hover preview. */
function StarPicker({ value, onChange, invalid }: { value: number; onChange: (n: number) => void; invalid?: boolean }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, (value || 0) + delta));
    onChange(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-star="${next}"]`)?.focus();
  };
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Chọn số sao"
        aria-invalid={invalid || undefined}
        onKeyDown={onKey}
        onMouseLeave={() => setHover(0)}
        className="flex gap-0.5"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            data-star={n}
            aria-checked={value === n}
            aria-label={`${n} sao`}
            tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="grid size-9 place-items-center rounded-md transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <Star aria-hidden strokeWidth={1.75} className={cn('size-6', n <= shown ? 'fill-nghe text-nghe' : 'text-input')} />
          </button>
        ))}
      </div>
      <span aria-hidden className="text-small text-muted-foreground">
        {LABELS[shown]}
      </span>
    </div>
  );
}

function RatingForm({ mine, onSave, onDelete }: Pick<RatingSectionProps, 'mine' | 'onSave' | 'onDelete'>) {
  const form = useForm<RatingValues>({
    resolver: zodResolver(ratingSchema),
    defaultValues: { score: mine?.score ?? 0, review: mine?.review ?? '' },
  });
  const review = useWatch({ control: form.control, name: 'review' }) ?? '';
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.score?.message ?? form.formState.errors.review?.message;

  const { score: savedScore = 0, review: savedReview = '' } = { score: mine?.score, review: mine?.review ?? '' };
  useEffect(() => {
    form.reset({ score: savedScore, review: savedReview });
  }, [savedScore, savedReview, form]);

  async function submit(values: RatingValues) {
    try {
      await onSave?.(values);
    } catch (e) {
      applyApiError(form, e);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate aria-label="Đánh giá của bạn" className="flex flex-col gap-2">
      <span className="text-label font-semibold">{mine ? 'Đánh giá của bạn' : 'Đánh giá truyện'}</span>
      <Controller
        control={form.control}
        name="score"
        render={({ field, fieldState }) => <StarPicker value={field.value} onChange={field.onChange} invalid={!!fieldState.error} />}
      />
      <Textarea
        rows={2}
        maxLength={REVIEW_MAX + 50}
        placeholder="Nhận xét của bạn (tùy chọn)"
        aria-label="Nhận xét"
        aria-invalid={!!form.formState.errors.review || undefined}
        {...form.register('review')}
        className="min-h-[64px] resize-y text-label"
      />
      <div className="flex items-center justify-between gap-3">
        {error ? (
          <p role="alert" className="text-small text-destructive">
            {error}
          </p>
        ) : (
          <span className="num text-caption text-muted-foreground">
            {formatNumber(review.length)}/{formatNumber(REVIEW_MAX)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="sm" disabled={pending} className="h-9 px-4 font-semibold">
          {pending && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
          {pending ? 'Đang gửi…' : mine ? 'Cập nhật' : 'Gửi'}
        </Button>
        {mine && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded-sm text-label text-muted-foreground underline underline-offset-2 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Xoá đánh giá
          </button>
        )}
      </div>
    </form>
  );
}

function ReviewItem({ r }: { r: Rating }) {
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)] gap-3.5 border-t border-border py-4.5">
      <UserAvatar name={r.user.username} avatarUrl={r.user.avatarUrl} size="md" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">@{r.user.username}</span>
          <span className="num inline-flex items-center gap-1 text-small font-semibold" aria-label={`${r.score} sao`}>
            <Star aria-hidden className="size-3.5 fill-nghe text-nghe" strokeWidth={1.75} />
            {r.score}
          </span>
          <span className="text-small text-muted-foreground">{formatDate(r.updatedAt)}</span>
        </div>
        {r.review && <p className="whitespace-pre-line">{r.review}</p>}
      </div>
    </li>
  );
}

/**
 * "Đánh giá" block of the story page (board RatingSection): average + stars + count, the 5 → 1
 * distribution, my rating (stars radiogroup + optional review, update / delete) and the newest reviews
 * with "Xem thêm đánh giá". Authors of the story and admins see no form; guests get a login prompt.
 */
export function RatingSection(props: RatingSectionProps) {
  const { ratings, moreReviews = [], hasMore, loadingMore, onLoadMore, mode, mine, onSave, onDelete, onLogin } = props;
  const reviews = ratings ? [...ratings.reviews.items, ...moreReviews] : [];

  return (
    <section aria-labelledby="rate-h" className="flex flex-col gap-5">
      <h2 id="rate-h" className="text-title-2 font-semibold">
        Đánh giá
      </h2>
      <div className="flex flex-wrap gap-8 rounded-lg border border-border bg-card p-5">
        {ratings ? (
          <>
            <div className="flex min-w-[120px] flex-col items-start gap-1">
              <span className="num font-serif text-[48px] leading-[52px] font-semibold">
                {ratings.ratingCount > 0 ? formatRating(ratings.ratingAvg) : '–'}
              </span>
              <span role="img" aria-label={`${formatRating(ratings.ratingAvg)} trên 5 sao`} className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    aria-hidden
                    strokeWidth={1.75}
                    className={cn('size-4', i <= Math.round(ratings.ratingAvg) ? 'fill-nghe text-nghe' : 'text-input')}
                  />
                ))}
              </span>
              <span className="text-small text-muted-foreground">
                {ratings.ratingCount > 0 ? `${formatNumber(ratings.ratingCount)} đánh giá` : 'Chưa có đánh giá'}
              </span>
            </div>
            <dl className="grid flex-[1_1_240px] grid-cols-[16px_minmax(0,1fr)_40px] items-center gap-x-3 gap-y-1.5 text-small text-muted-foreground">
              {distributionRows(ratings).map((d) => (
                <div key={d.star} className="contents">
                  <dt className="num">
                    {d.star}
                    <span className="sr-only"> sao</span>
                  </dt>
                  <dd aria-hidden className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <span className="block h-full bg-nghe" style={{ width: `${d.percent}%` }} />
                  </dd>
                  <dd className="num text-right">{d.percent}%</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <div className="flex flex-[1_1_360px] gap-8" aria-label="Đang tải đánh giá">
            <Skeleton className="h-24 w-28 bg-secondary" />
            <div className="flex flex-1 flex-col gap-2.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-3 bg-secondary" />
              ))}
            </div>
          </div>
        )}
        {mode !== 'admin' && (
          <div className="flex flex-[1_1_260px] flex-col gap-2 border-border max-md:border-t max-md:pt-5 md:border-l md:pl-6">
            {mode === 'form' && <RatingForm mine={mine} onSave={onSave} onDelete={onDelete} />}
            {mode === 'guest' && (
              <>
                <span className="text-label font-semibold">Đánh giá truyện này</span>
                <p className="text-label text-muted-foreground">Đăng nhập để chấm sao và viết nhận xét.</p>
                <Button size="sm" variant="outline" className="self-start" onClick={onLogin}>
                  Đăng nhập để đánh giá
                </Button>
              </>
            )}
            {mode === 'own-story' && (
              <>
                <span className="text-label font-semibold">Truyện của bạn</span>
                <p className="text-label text-muted-foreground">Tác giả không tự đánh giá truyện của mình.</p>
              </>
            )}
          </div>
        )}
      </div>

      {ratings && reviews.length === 0 && ratings.ratingCount > 0 && (
        <p className="text-muted-foreground">Chưa có ai viết nhận xét.</p>
      )}
      {reviews.length > 0 && (
        <ul aria-label="Nhận xét của độc giả" className="flex flex-col">
          {reviews.map((r) => (
            <ReviewItem key={r.user.userId} r={r} />
          ))}
        </ul>
      )}
      {hasMore && (
        <Button variant="outline" className="self-center px-5" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
          Xem thêm đánh giá
        </Button>
      )}
    </section>
  );
}
