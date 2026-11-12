import { BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '@/components/common/UserAvatar';
import { StoryCard } from '@/components/story/StoryCard';
import { cn } from '@/lib/utils';
import type { FollowedAuthor, HistoryItem, ReadingListSummary } from '@/types/library';
import { formatNumber } from '@/utils/format';

const linkButton =
  'self-start rounded-sm text-label font-medium underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50';

/**
 * "Đang đọc" item of the library (board Library): story card, 3px reading bar, "Đang đọc Chương N · 42%"
 * and "Xoá khỏi lịch sử".
 */
export function HistoryCard({ item }: { item: HistoryItem; onRemove: () => void; removing?: boolean }) {
  const pct = Math.round(item.scrollPercent);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <StoryCard story={item.story} />
      <span aria-hidden className="h-[3px] overflow-hidden rounded-full bg-secondary">
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-small text-muted-foreground">
        {item.lastChapter ? (
          <Link to={`/chapters/${item.lastChapter.chapterId}`} className="hover:text-foreground hover:underline">
            Chương {item.lastChapter.chapterNo} · {pct}%
          </Link>
        ) : (
          'Chương đang đọc đã bị gỡ'
        )}
      </span>
    </div>
  );
}

/** "Tác giả theo dõi" row (board Library): avatar, pen name + verified mark, followers, follow toggle. */
export function FollowedAuthorRow({
  author,
  following,
  onToggle,
  pending,
}: {
  author: FollowedAuthor;
  following: boolean;
  onToggle: () => void;
  pending?: boolean;
}) {
  return (
    <li className="flex items-center gap-4 border-t border-border py-3.5">
      <UserAvatar name={author.penName} avatarUrl={author.avatarUrl} size="md" className="size-11" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          to={`/authors/${author.authorId}`}
          className="inline-flex max-w-full items-center gap-1 self-start font-serif text-[17px] leading-6 font-semibold hover:text-primary"
        >
          <span className="truncate">{author.penName}</span>
          {author.isVerified && <BadgeCheck aria-label="Tác giả đã xác minh" className="size-4 shrink-0 text-primary" strokeWidth={1.75} />}
        </Link>
        <span className="text-small text-muted-foreground">{formatNumber(author.followerCount)} người theo dõi</span>
      </div>
      <button
        type="button"
        aria-pressed={following}
        onClick={onToggle}
        disabled={pending}
        className={cn(linkButton, following ? 'text-muted-foreground hover:text-foreground' : 'text-primary')}
      >
        {following ? 'Bỏ theo dõi' : 'Theo dõi'}
      </button>
    </li>
  );
}

/* Decorative spines of a list card (the summary has no covers): 3 cover tones picked by listId. */
const SPINES = ['bg-primary', 'bg-link', 'bg-foreground', 'bg-[#6b2e5f]', 'bg-[#2c6e6a]', 'bg-[#b9791a]'];

/** "Tủ truyện" card (board Library): 3 stacked spines, name, "N truyện · Công khai", rename / delete. */
export function ShelfCard({ list, onRename, onDelete }: { list: ReadingListSummary; onRename: () => void; onDelete: () => void }) {
  const tones = [0, 1, 2].map((k) => SPINES[(list.listId + k * 2) % SPINES.length]);
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-border bg-card p-5">
      <Link to={`/lists/${list.listId}`} tabIndex={-1} aria-hidden className="flex h-[100px] items-center pl-3">
        {tones.map((t, k) => (
          <span key={k} className={cn('h-[88px] w-[62px] rounded-[3px] shadow-[0_1px_4px_rgb(31_33_96/0.25)]', t, k > 0 && '-ml-[34px]')} />
        ))}
      </Link>
      <div className="min-w-0">
        <Link to={`/lists/${list.listId}`} className="font-serif text-[18px] leading-6 font-semibold hover:text-primary">
          {list.name}
        </Link>
        <div className="text-small text-muted-foreground">
          {formatNumber(list.itemCount)} truyện · {list.isPublic ? 'Công khai' : 'Riêng tư'}
        </div>
      </div>
      <div className="flex gap-4">
        <button type="button" onClick={onRename} aria-label={`Đổi tên tủ “${list.name}”`} className={cn(linkButton, 'text-primary')}>
          Đổi tên
        </button>
        <button type="button" onClick={onDelete} aria-label={`Xoá tủ “${list.name}”`} className={cn(linkButton, 'text-destructive')}>
          Xoá tủ
        </button>
      </div>
    </article>
  );
}
