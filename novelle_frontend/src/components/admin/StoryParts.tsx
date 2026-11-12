import { BadgeCheck, ChevronsUpDown, ExternalLink, Eye, EyeOff, Loader2, Star, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '@/components/common/UserAvatar';
import { StoryCover } from '@/components/story/StoryCover';
import { PublishBadge } from '@/components/studio/StudioBadges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { AdminStoryItem, AdminUserItem } from '@/types/admin';
import type { Rating } from '@/types/rating';
import { formatCompact, formatDate, formatNumber, formatRating } from '@/utils/format';
import { ICON_BTN, ROW_BTN, STORY_GRID } from './adminStyles';

interface ModerationRowProps {
  story: AdminStoryItem;
  onOpen: () => void;
  onToggleHide: () => void;
  /** filter the list by this author */
  onAuthor: () => void;
}

/**
 * One story (board AdminStories): cover, title + primary genre, author (click = filter), status, chapters
 * (+ drafts), views, rating, "Chi tiết" and hide / unhide. Drafts cannot be hidden (CONFLICT).
 */
export function ModerationRow({ story: s, onOpen, onToggleHide, onAuthor }: ModerationRowProps) {
  const hidden = s.publishStatus === 'HIDDEN';
  const label = hidden ? `Bỏ ẩn “${s.title}”` : s.publishStatus === 'DRAFT' ? 'Truyện nháp chưa cần ẩn' : `Ẩn “${s.title}”`;
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-label', STORY_GRID)}>
      <button type="button" onClick={onOpen} className="flex min-w-0 basis-full items-center gap-3 rounded-md text-left xl:basis-auto">
        <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="xs" className="w-10 flex-none" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-serif text-base font-semibold">{s.title}</span>
          <span className="truncate text-small text-muted-foreground">{s.primaryGenre?.name ?? 'Chưa có thể loại'}</span>
        </span>
      </button>
      <button type="button" onClick={onAuthor} title={`Lọc truyện của ${s.author.penName}`} className="inline-flex min-w-0 items-center gap-1 truncate text-left hover:text-primary hover:underline">
        <span className="truncate">{s.author.penName}</span>
        {s.author.isVerified && <BadgeCheck aria-label="đã xác minh" className="size-3.5 shrink-0 text-primary" strokeWidth={1.75} />}
      </button>
      <span>
        <PublishBadge status={s.publishStatus} />
      </span>
      <span className="num">
        {formatNumber(s.chapterCount)}
        <span className="xl:hidden"> chương</span>
        {s.draftChapterCount > 0 && <span className="block text-caption text-muted-foreground">+{formatNumber(s.draftChapterCount)} nháp</span>}
      </span>
      <span className="num inline-flex items-center gap-1.5">
        <Eye aria-hidden className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        {formatCompact(s.viewCount)}
      </span>
      <span className="num inline-flex items-center gap-1">
        {s.ratingCount > 0 ? (
          <>
            <Star aria-hidden className="size-3.5 fill-nghe text-nghe" strokeWidth={1.75} />
            {formatRating(s.ratingAvg)}
          </>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </span>
      <div className="flex items-center justify-end gap-2 max-xl:ml-auto">
        <button type="button" onClick={onOpen} className={ROW_BTN}>
          Chi tiết
        </button>
        <button
          type="button"
          onClick={onToggleHide}
          disabled={s.publishStatus === 'DRAFT'}
          aria-label={label}
          title={label}
          className={cn(ICON_BTN, hidden ? 'text-success' : 'text-destructive')}
        >
          {hidden ? <Eye aria-hidden className="size-4" strokeWidth={1.75} /> : <EyeOff aria-hidden className="size-4" strokeWidth={1.75} />}
        </button>
      </div>
    </li>
  );
}

interface AuthorFilterProps {
  /** the chosen author, if any */
  value?: { authorId: number; penName?: string };
  onChange: (author: { authorId: number; penName: string } | null) => void;
  /** U1 role=AUTHOR&q= (AuthorId = UserId); undefined while loading */
  results?: AdminUserItem[];
  query: string;
  onQueryChange: (q: string) => void;
  loading?: boolean;
}

/** "Tác giả" filter (AdminStories board): a combobox that searches authors; the choice shows as a chip with ×. */
export function AuthorFilter({ value, onChange, results, query, onQueryChange, loading }: AuthorFilterProps) {
  const [open, setOpen] = useState(false);
  if (value) {
    return (
      <span className="inline-flex h-10 items-center gap-1 rounded-full bg-accent pr-1.5 pl-3.5 text-label font-medium text-primary">
        Tác giả: {value.penName ?? `#${value.authorId}`}
        <button
          type="button"
          aria-label="Bỏ lọc tác giả"
          onClick={() => onChange(null)}
          className="grid size-7 place-items-center rounded-full hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-fit justify-between gap-6 font-normal text-muted-foreground" aria-haspopup="listbox">
          Tác giả: Tất cả
          <ChevronsUpDown aria-hidden className="size-4" strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-2" aria-label="Lọc theo tác giả">
        <Input autoFocus value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Tìm bút danh hoặc username" aria-label="Tìm tác giả" />
        <ul role="listbox" aria-label="Tác giả" className="mt-2 max-h-[260px] overflow-y-auto">
          {loading && (
            <li className="flex items-center gap-2 px-2 py-2 text-label text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.75} /> Đang tìm…
            </li>
          )}
          {!loading && results?.length === 0 && <li className="px-2 py-2 text-label text-muted-foreground">Không có tác giả khớp.</li>}
          {results?.map((a) => (
            <li key={a.userId} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  onChange({ authorId: a.userId, penName: a.displayName });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-label hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <UserAvatar name={a.displayName} avatarUrl={a.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate">{a.displayName}</span>
                <span className="truncate text-small text-muted-foreground">@{a.username}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface StoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story?: AdminStoryItem;
  onToggleHide: () => void;
  onDelete: () => void;
  /** D1 reviews (only for PUBLISHED stories, decision 2); undefined while loading */
  reviews?: Rating[];
  reviewCount?: number;
  reviewsError?: boolean;
  hasMoreReviews?: boolean;
  loadingMoreReviews?: boolean;
  onMoreReviews?: () => void;
  onDeleteReview: (r: Rating) => void;
}

/**
 * "Chi tiết truyện" (board AdminStories, side sheet): cover, title, author · genre, status; chapters / views /
 * rating; hide reason; hide / unhide; public page link; reviews with delete (published stories only); a red
 * "Xoá truyện" zone (decision 3).
 */
export function StoryDetailSheet(p: StoryDetailSheetProps) {
  const s = p.story;
  const published = s?.publishStatus === 'PUBLISHED';
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent side="right" className="w-[480px] gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="font-serif text-[18px] leading-6">Chi tiết truyện</SheetTitle>
          <SheetDescription className="sr-only">Thông tin, ẩn / bỏ ẩn, đánh giá của độc giả và xoá truyện.</SheetDescription>
        </SheetHeader>
        {s && (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
            <div className="flex gap-4">
              <StoryCover storyId={s.storyId} title={s.title} coverUrl={s.coverUrl} size="sm" className="w-20 flex-none" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-serif text-[20px] leading-[26px] font-semibold">{s.title}</h3>
                <span className="text-label text-muted-foreground">
                  {s.author.penName} · {s.primaryGenre?.name ?? 'Chưa có thể loại'}
                </span>
                <span>
                  <PublishBadge status={s.publishStatus} />
                </span>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-label">
              {(
                [
                  ['Chương', `${formatNumber(s.chapterCount)}${s.draftChapterCount ? ` (+${s.draftChapterCount} nháp)` : ''}`],
                  ['Lượt xem', formatNumber(s.viewCount)],
                  ['Điểm', s.ratingCount ? `${formatRating(s.ratingAvg)} (${formatNumber(s.ratingCount)})` : '–'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 rounded-md bg-secondary px-3.5 py-3">
                  <dt className="text-caption text-muted-foreground">{k}</dt>
                  <dd className="num font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {s.hiddenReason && (
              <div role="status" className="rounded-md bg-critical-soft px-3.5 py-3 text-label text-destructive">
                <b>Lý do ẩn:</b> <span className="text-foreground">{s.hiddenReason}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={s.publishStatus === 'HIDDEN' ? 'outline' : 'destructive'}
                disabled={s.publishStatus === 'DRAFT'}
                onClick={p.onToggleHide}
                className="flex-1 font-semibold"
              >
                {s.publishStatus === 'HIDDEN' ? <Eye strokeWidth={1.75} /> : <EyeOff strokeWidth={1.75} />}
                {s.publishStatus === 'HIDDEN' ? 'Bỏ ẩn truyện' : 'Ẩn truyện'}
              </Button>
              {published && (
                <Button variant="outline" asChild>
                  <Link to={`/stories/${s.slug}`}>
                    <ExternalLink strokeWidth={1.75} /> Trang công khai
                  </Link>
                </Button>
              )}
            </div>
            {s.publishStatus === 'DRAFT' && <p className="text-small text-muted-foreground">Truyện đang là bản nháp, người đọc chưa thấy nên chưa cần ẩn.</p>}

            <section aria-labelledby="sheet-reviews" className="flex flex-col gap-3">
              <h4 id="sheet-reviews" className="text-label font-semibold">
                Đánh giá của độc giả {published && p.reviewCount != null && <span className="font-normal text-muted-foreground">({formatNumber(p.reviewCount)})</span>}
              </h4>
              {!published ? (
                <p className="text-small text-muted-foreground">Chỉ xem được đánh giá khi truyện đang đăng.</p>
              ) : p.reviewsError ? (
                <p className="text-small text-muted-foreground">Không tải được đánh giá.</p>
              ) : !p.reviews ? (
                <p className="flex items-center gap-2 text-small text-muted-foreground">
                  <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={1.75} /> Đang tải đánh giá…
                </p>
              ) : p.reviews.length === 0 ? (
                <p className="text-small text-muted-foreground">Truyện chưa có đánh giá nào.</p>
              ) : (
                <ul className="flex flex-col">
                  {p.reviews.map((r) => (
                    <li key={r.user.userId} className="flex gap-3 border-t border-border py-3 first:border-t-0">
                      <UserAvatar name={r.user.username} avatarUrl={r.user.avatarUrl} size="nav" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 text-label">
                          <b>@{r.user.username}</b>
                          <span className="num inline-flex items-center gap-1 text-small font-semibold">
                            <Star aria-hidden className="size-3.5 fill-nghe text-nghe" strokeWidth={1.75} />
                            {r.score}
                          </span>
                          <span className="text-small text-muted-foreground">{formatDate(r.updatedAt)}</span>
                        </div>
                        {r.review ? <p className="text-label whitespace-pre-line">{r.review}</p> : <p className="text-small text-muted-foreground">Không có nhận xét.</p>}
                      </div>
                      <button type="button" onClick={() => p.onDeleteReview(r)} aria-label={`Xoá đánh giá của @${r.user.username}`} title="Xoá đánh giá" className={cn(ICON_BTN, 'text-destructive')}>
                        <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {published && p.hasMoreReviews && (
                <Button variant="outline" size="sm" className="self-start" onClick={p.onMoreReviews} disabled={p.loadingMoreReviews}>
                  {p.loadingMoreReviews && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
                  Xem thêm đánh giá
                </Button>
              )}
            </section>

            <section aria-labelledby="sheet-danger" className="mt-2 flex flex-col gap-2 rounded-lg border border-destructive/40 p-4">
              <h4 id="sheet-danger" className="text-label font-semibold text-destructive">
                Xoá truyện
              </h4>
              <p className="text-small text-muted-foreground">Xoá vĩnh viễn truyện cùng toàn bộ tập, chương và đánh giá. Tác giả không khôi phục được.</p>
              <Button variant="destructive" size="sm" className="self-start" onClick={p.onDelete}>
                <Trash2 strokeWidth={1.75} /> Xoá truyện
              </Button>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
