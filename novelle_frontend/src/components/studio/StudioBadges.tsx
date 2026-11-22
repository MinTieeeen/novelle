import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CHAPTER_STATUS_LABEL, PUBLISH_STATUS_LABEL, type ChapterStatus, type PublishStatus } from '@/types/studio';
import { formatDateTime } from '@/utils/format';

const PUBLISH_VARIANT = { PUBLISHED: 'success', DRAFT: 'outline', HIDDEN: 'critical' } as const;
const CHAPTER_VARIANT = { PUBLISHED: 'success', DRAFT: 'outline', SCHEDULED: 'warning' } as const;

/** Story status pill (StudioStoryRow, StudioManage): Đã đăng / Bản nháp / Bị ẩn. */
export function PublishBadge({ status, className }: { status: PublishStatus; className?: string }) {
  return (
    <Badge variant={PUBLISH_VARIANT[status]} className={cn('rounded-full px-2.5 font-semibold', className)}>
      {PUBLISH_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Chapter status pill (ChapterList, editor): Đã đăng / Nháp / Hẹn giờ (with the time, Vietnam). */
export function ChapterStatusBadge({ status, scheduledAt, className }: { status: ChapterStatus; scheduledAt?: string | null; className?: string }) {
  return (
    <Badge variant={CHAPTER_VARIANT[status]} className={cn('rounded-full px-2.5 font-semibold', className)}>
      {CHAPTER_STATUS_LABEL[status]}
      {status === 'SCHEDULED' && scheduledAt && <span className="num font-normal"> · {formatDateTime(scheduledAt)}</span>}
    </Badge>
  );
}
