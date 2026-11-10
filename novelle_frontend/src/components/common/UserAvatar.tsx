import { Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { initials } from '@/utils/format';

const SIZES = {
  /** header, tables */
  sm: { box: 'size-7', text: 'text-caption', badge: 'size-3 -right-1 -bottom-1', check: 'size-2' },
  /** header account button (SiteHeader board: 36px) */
  nav: { box: 'size-9', text: 'text-small', badge: 'size-3.5', check: 'size-2.5' },
  /** reviews, lists */
  md: { box: 'size-10', text: 'text-body', badge: 'size-4', check: 'size-3' },
  /** author page, profile */
  lg: { box: 'size-18', text: 'text-[26px]', badge: 'size-[22px]', check: 'size-3.5' },
} as const;

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  /** Verified author: round cham tick at the bottom right. */
  verified?: boolean;
  className?: string;
}

/**
 * Avatar of the design system: the image, or 1–2 initials on cham-soft. Users cannot upload an avatar
 * (out of scope), so there is no upload button.
 */
export function UserAvatar({ name, avatarUrl, size = 'md', verified, className }: UserAvatarProps) {
  const s = SIZES[size];
  return (
    <span className={cn('relative inline-flex w-fit shrink-0 self-start', className)}>
      <Avatar className={s.box}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className={cn('bg-accent font-semibold text-accent-foreground', s.text)}>{initials(name)}</AvatarFallback>
      </Avatar>
      {verified && (
        <span
          role="img"
          aria-label="Đã xác minh"
          className={cn(
            'absolute -right-0.5 -bottom-0.5 grid place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card',
            s.badge,
          )}
        >
          <Check className={s.check} strokeWidth={3} aria-hidden />
        </span>
      )}
    </span>
  );
}
