import { BadgeCheck, Lock, LockOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { AdminUserDetail, AdminUserItem } from '@/types/admin';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/utils/format';
import { RoleBadge, UserStatusBadge } from './AdminBadges';
import { ICON_BTN, ROW_BTN, USER_GRID } from './adminStyles';

interface UserRowProps {
  user: AdminUserItem;
  /** the logged-in admin */
  self: boolean;
  onOpen: () => void;
  onToggleLock: () => void;
}

/**
 * One account (board AdminUsers): avatar, name (+ "(bạn)"), @username · email, role, status, joined,
 * "Chi tiết" and the lock / unlock icon. Admins cannot be banned (CANNOT_BAN_ADMIN): their icon is off.
 */
export function UserRow({ user, self, onOpen, onToggleLock }: UserRowProps) {
  const banned = user.status === 'BANNED';
  const lockable = user.role !== 'ADMIN';
  const lockLabel = !lockable ? 'Không khoá được quản trị viên' : banned ? `Mở khoá ${user.displayName}` : `Khoá ${user.displayName}`;
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-label', USER_GRID)}>
      <button type="button" onClick={onOpen} className="flex min-w-0 basis-full items-center gap-3 rounded-md text-left xl:basis-auto">
        <UserAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="md" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">
            {user.displayName}
            {self && <span className="font-normal text-muted-foreground"> (bạn)</span>}
          </span>
          <span className="truncate text-small text-muted-foreground">
            @{user.username} · {user.email}
          </span>
        </span>
      </button>
      <span>
        <RoleBadge role={user.role} />
      </span>
      <span>
        <UserStatusBadge status={user.status} />
      </span>
      <span className="text-muted-foreground">{formatDate(user.createdAt)}</span>
      <div className="flex items-center justify-end gap-2 max-xl:ml-auto">
        <button type="button" onClick={onOpen} className={ROW_BTN}>
          Chi tiết
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          disabled={!lockable}
          aria-label={lockLabel}
          title={lockLabel}
          className={cn(ICON_BTN, banned ? 'text-success' : 'text-destructive')}
        >
          {banned ? <LockOpen aria-hidden className="size-4" strokeWidth={1.75} /> : <Lock aria-hidden className="size-4" strokeWidth={1.75} />}
        </button>
      </div>
    </li>
  );
}

interface UserDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** U2; undefined while loading */
  user?: AdminUserDetail;
  error?: boolean;
  self: boolean;
  onToggleLock: () => void;
  onVerify: (isVerified: boolean) => void;
  verifying?: boolean;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-secondary px-3.5 py-3">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

/**
 * "Chi tiết người dùng" (board AdminUsers, side sheet 480px): identity, role / status, author requests,
 * stories, joined, last login, ban reason (+ by whom, when), "Tích xanh tác giả" switch for authors,
 * lock / unlock button (off for admins).
 */
export function UserDetailSheet({ open, onOpenChange, user: u, error, onToggleLock, onVerify, verifying }: UserDetailSheetProps) {
  const requests = u ? u.authorRequests.pending + u.authorRequests.approved + u.authorRequests.rejected + u.authorRequests.cancelled : 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] gap-0 p-0 sm:max-w-[480px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="font-serif text-[18px] leading-6">Chi tiết người dùng</SheetTitle>
          <SheetDescription className="sr-only">Thông tin tài khoản, khoá / mở khoá và tích xanh tác giả.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {error && <p className="text-muted-foreground">Không tải được người dùng này.</p>}
          {!u && !error && (
            <div className="flex flex-col gap-4" aria-label="Đang tải">
              <Skeleton className="h-16 bg-secondary" />
              <Skeleton className="h-32 bg-secondary" />
            </div>
          )}
          {u && (
            <>
              <div className="flex items-center gap-4">
                <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size="lg" className="size-16 text-[22px]" verified={u.author?.isVerified} />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-serif text-[22px] leading-7 font-semibold">
                    <span className="truncate">{u.displayName}</span>
                    {u.author?.isVerified && <BadgeCheck aria-label="Tác giả đã xác minh" className="size-5 shrink-0 text-primary" strokeWidth={1.75} />}
                  </div>
                  <div className="truncate text-label text-muted-foreground">
                    @{u.username} · {u.email}
                  </div>
                  <div className="flex gap-2">
                    <RoleBadge role={u.role} />
                    <UserStatusBadge status={u.status} />
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-label">
                <Fact label="Yêu cầu tác giả">
                  {requests > 0 ? (
                    <Link to="/admin/author-requests?status=ALL" className="text-link hover:underline">
                      {formatNumber(requests)}
                      {u.authorRequests.pending > 0 && ` (${u.authorRequests.pending} chờ duyệt)`}
                    </Link>
                  ) : (
                    '0'
                  )}
                </Fact>
                <Fact label="Truyện">{u.author ? formatNumber(u.author.storyCount) : '–'}</Fact>
                <Fact label="Ngày tham gia">{formatDate(u.createdAt)}</Fact>
                <Fact label="Đăng nhập gần nhất">{u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Chưa đăng nhập'}</Fact>
              </dl>
              {u.ban && (
                <div role="status" className="rounded-md bg-critical-soft px-3.5 py-3 text-label text-destructive">
                  <b>Lý do khoá:</b> <span className="text-foreground">{u.ban.reason}</span>
                  <div className="mt-1 text-small text-muted-foreground">
                    Khoá lúc {formatDateTime(u.ban.bannedAt)}
                    {u.ban.by?.username && ` bởi @${u.ban.by.username}`}
                  </div>
                </div>
              )}
              {u.author && (
                <label className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3.5">
                  <span className="flex flex-col">
                    <span className="font-semibold">Xác minh tác giả</span>
                    <span className="text-small text-muted-foreground">
                      Hiện dấu tích bên cạnh bút danh “{u.author.penName}”
                    </span>
                  </span>
                  <Switch checked={u.author.isVerified} disabled={verifying} onCheckedChange={onVerify} aria-label="Tích xanh tác giả" />
                </label>
              )}
              <Button
                variant={u.status === 'BANNED' ? 'outline' : 'destructive'}
                disabled={u.role === 'ADMIN'}
                onClick={onToggleLock}
                className="w-full font-semibold"
              >
                {u.status === 'BANNED' ? <LockOpen strokeWidth={1.75} /> : <Lock strokeWidth={1.75} />}
                {u.status === 'BANNED' ? 'Mở khoá tài khoản' : 'Khoá tài khoản'}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
