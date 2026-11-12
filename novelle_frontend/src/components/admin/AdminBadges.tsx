import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ADMIN_ROLE_LABEL, USER_STATUS_LABEL, type UserStatus } from '@/types/admin';
import type { Role } from '@/types/user';

const ROLE_CLASS: Record<Role, string> = {
  READER: 'bg-secondary text-muted-foreground',
  AUTHOR: 'bg-accent text-primary',
  ADMIN: 'bg-nghe-soft text-nghe-ink',
};

/** Người đọc / Tác giả / Admin pill (AdminUsers board). */
export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return <Badge className={cn('rounded-full px-2.5 font-semibold', ROLE_CLASS[role], className)}>{ADMIN_ROLE_LABEL[role]}</Badge>;
}

/** Hoạt động (success) / Bị khoá (critical). */
export function UserStatusBadge({ status, className }: { status: UserStatus; className?: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'critical'} className={cn('rounded-full px-2.5 font-semibold', className)}>
      {USER_STATUS_LABEL[status]}
    </Badge>
  );
}
