import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FollowButtonProps {
  following: boolean;
  onToggle: () => void;
  /** e.g. "truyện" / "tác giả": completes the accessible name ("Theo dõi truyện") */
  target: string;
  disabled?: boolean;
  size?: 'lg' | 'default';
  className?: string;
}

/**
 * "Theo dõi" / "Đang theo dõi" toggle (StoryHero, AuthorHeader boards): outline button, cham-soft when on,
 * `aria-pressed`. The page flips it optimistically and rolls back on error.
 */
export function FollowButton({ following, onToggle, target, disabled, size = 'lg', className }: FollowButtonProps) {
  const Icon = following ? BookmarkCheck : Bookmark;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      aria-pressed={following}
      aria-label={following ? `Đang theo dõi ${target}, bấm để bỏ theo dõi` : `Theo dõi ${target}`}
      onClick={onToggle}
      disabled={disabled}
      className={cn(size === 'lg' && 'h-11 px-4 font-medium', following && 'border-accent bg-accent text-primary hover:bg-accent/80', className)}
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-4" />
      {following ? 'Đang theo dõi' : 'Theo dõi'}
    </Button>
  );
}
