import { Eye, EyeOff, ExternalLink, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StoryCover } from '@/components/story/StoryCover';
import { PublishBadge } from '@/components/studio/StudioBadges';
import { STUDIO_ROW_GRID } from '@/components/studio/studioStyles';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { StudioStoryCard } from '@/types/studio';
import { formatCompact, formatNumber, formatRelative } from '@/utils/format';


interface StudioStoryRowProps {
  story: StudioStoryCard;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  busy?: boolean;
}

/**
 * One of my stories (board StudioStoryRow): cover, title + primary genre, status, chapters (+ drafts), views,
 * last change, "Quản lý" and the ⋯ menu (publish / unpublish by status, public page when published,
 * delete). A table row from 1024px, a card below.
 */
export function StudioStoryRow({ story, onPublish, onUnpublish, onDelete, busy }: StudioStoryRowProps) {
  const manage = `/studio/stories/${story.storyId}`;
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-label', STUDIO_ROW_GRID)}>
      <div className="flex min-w-0 basis-full items-center gap-3.5 lg:basis-auto">
        <StoryCover storyId={story.storyId} title={story.title} coverUrl={story.coverUrl} size="xs" className="w-12 flex-none" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link to={manage} className="truncate font-serif text-base leading-[22px] font-semibold hover:text-primary">
            {story.title}
          </Link>
          <span className="text-small text-muted-foreground">{story.primaryGenre?.name ?? 'Chưa có thể loại'}</span>
        </span>
      </div>
      <span>
        <PublishBadge status={story.publishStatus} />
      </span>
      <span className="num">
        {formatNumber(story.chapterCount)}
        <span className="lg:hidden"> chương</span>
        {story.draftChapterCount > 0 && <span className="block text-caption text-muted-foreground">+{formatNumber(story.draftChapterCount)} nháp</span>}
      </span>
      <span className="num inline-flex items-center gap-1.5" aria-label={`${formatNumber(story.viewCount)} lượt xem`}>
        <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
        {formatCompact(story.viewCount)}
      </span>
      <span className="text-muted-foreground max-lg:basis-full max-lg:text-small">
        <span className="lg:hidden">Cập nhật </span>
        {formatRelative(story.updatedAt)}
      </span>
      <div className="flex items-center gap-2 max-lg:ml-auto lg:justify-end">
        <Link
          to={manage}
          className="inline-flex h-[34px] items-center rounded-md border border-input px-3 text-small font-medium transition-colors hover:bg-secondary"
        >
          Quản lý
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            aria-label={`Thêm hành động cho “${story.title}”`}
            className="grid size-[34px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary data-[state=open]:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <MoreHorizontal aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {story.publishStatus === 'DRAFT' && (
              <DropdownMenuItem onSelect={onPublish}>
                <Send strokeWidth={1.75} /> Đăng truyện
              </DropdownMenuItem>
            )}
            {story.publishStatus === 'PUBLISHED' && (
              <DropdownMenuItem onSelect={onUnpublish}>
                <EyeOff strokeWidth={1.75} /> Gỡ đăng
              </DropdownMenuItem>
            )}
            {story.publishStatus === 'PUBLISHED' && (
              <DropdownMenuItem asChild>
                <Link to={`/stories/${story.slug}`}>
                  <ExternalLink strokeWidth={1.75} /> Xem trang công khai
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 strokeWidth={1.75} /> Xoá truyện
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
