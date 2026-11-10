import { CircleAlert, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorResultProps {
  /** not-found: the thing does not exist (404 codes); error: loading failed, can be retried. */
  variant?: 'error' | 'not-found';
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  /** Extra action, e.g. a link back home. */
  action?: ReactNode;
  className?: string;
}

/** Result block for a failed query: says what happened and what to do, never apologises. */
export function ErrorResult({ variant = 'error', title, description, onRetry, action, className }: ErrorResultProps) {
  if (variant === 'not-found') {
    return (
      <EmptyState
        className={className}
        title={title ?? 'Không tìm thấy nội dung này'}
        description={description ?? 'Đường dẫn có thể đã đổi hoặc nội dung đã bị gỡ.'}
        action={action}
      />
    );
  }
  return (
    <div role="alert" className={cn('flex h-fit max-w-[520px] items-start gap-3 rounded-lg bg-critical-soft p-6', className)}>
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
      <div className="flex flex-col items-start gap-3">
        <div>
          <p className="font-semibold">{title ?? 'Chưa tải được nội dung'}</p>
          <p className="text-label text-muted-foreground">{description ?? 'Kiểm tra kết nối rồi thử lại.'}</p>
        </div>
        {(onRetry || action) && (
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCw /> Thử lại
              </Button>
            )}
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
