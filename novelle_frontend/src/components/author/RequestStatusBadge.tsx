import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_VARIANT, type AuthorRequestStatus } from '@/types/authorRequest';

/** Status pill of an author request (R10 history, AD3, AD4): Chờ duyệt / Đã duyệt / Từ chối / Đã huỷ. */
export function RequestStatusBadge({ status, size = 'default', className }: { status: AuthorRequestStatus; size?: 'default' | 'lg'; className?: string }) {
  return (
    <Badge
      variant={REQUEST_STATUS_VARIANT[status]}
      className={cn('rounded-full px-2.5 font-semibold', size === 'lg' && 'h-7 px-3 text-small', className)}
    >
      {REQUEST_STATUS_LABEL[status]}
    </Badge>
  );
}
