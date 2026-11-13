import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SubmitButtonProps {
  pending: boolean;
  /** Seconds left of a RATE_LIMITED cooldown; 0 when allowed. */
  cooldown?: number;
  pendingLabel: string;
  children: ReactNode;
  /** Full-width 44px button of the AuthModal board. */
  block?: boolean;
  disabled?: boolean;
}

/** Primary submit button: spinner + "Đang …" while pending, countdown while rate-limited. */
export function SubmitButton({ pending, cooldown = 0, pendingLabel, children, block, disabled }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={pending || cooldown > 0 || disabled}
      aria-live="polite"
      className={cn(block && 'mt-2 h-11 w-full text-body font-semibold')}
    >
      {pending && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
      {pending ? pendingLabel : cooldown > 0 ? `Thử lại sau ${cooldown} giây` : children}
    </Button>
  );
}
