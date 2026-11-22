import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getAdminUser, getAdminUsers, getStatsOverview } from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthProvider';
import { AdminDateField } from '@/components/admin/AdminDateField';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { AdminSearch } from '@/components/admin/AdminSearch';
import { CreateAdminDialog } from '@/components/admin/CreateAdminDialog';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { UserDetailSheet, UserRow } from '@/components/admin/UserParts';
import { TABLE, TABLE_HEAD_XL, USER_GRID } from '@/components/admin/adminStyles';
import { AppPagination } from '@/components/common/AppPagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminUserActions } from '@/hooks/useAdminActions';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import { BAN_REASONS, parseUserFilters, toUserParams, type UserStatus } from '@/types/admin';
import type { Role } from '@/types/user';
import { hasCode } from '@/utils/errors';

const PAGE_SIZE = 20;

interface LockTarget {
  userId: number;
  username: string;
  banned: boolean;
}

/**
 * AD2 · Người dùng (/admin/users?q=&role=&status=&from=&to=&page=&user=, board AdminUsers): "Tạo admin",
 * search, role and status tabs (counts from S1), registration date range, the table (U1), paging; the
 * detail sheet (U2) opens from `?user=` so Back closes it; ban with a reason (U3), unban (U4), author
 * badge (U6). Admins cannot be banned (CANNOT_BAN_ADMIN), so their lock is off.
 */
export default function UsersPage() {
  useDocumentTitle('Người dùng');
  const { user: me } = useAuth();
  const { filters, update, setPage, selected, select } = useAdminFilters(parseUserFilters, toUserParams, 'user');
  const [createOpen, setCreateOpen] = useState(false);
  const [lock, setLock] = useState<LockTarget | null>(null);
  const actions = useAdminUserActions();

  const query = { q: filters.q || undefined, role: filters.role, status: filters.status, from: filters.from, to: filters.to, page: filters.page, size: PAGE_SIZE };
  const list = useQuery({ queryKey: queryKeys.admin.users.list(query), queryFn: () => getAdminUsers(query), placeholderData: keepPreviousData });
  const overview = useQuery({ queryKey: queryKeys.admin.stats.overview, queryFn: getStatsOverview, staleTime: 60_000 });
  const detail = useQuery({
    queryKey: queryKeys.admin.users.detail(selected ?? 0),
    queryFn: () => getAdminUser(selected!),
    enabled: selected !== null,
    retry: (n, e) => !hasCode(e, 'USER_NOT_FOUND') && n < 2,
  });

  // ?user= of an account that does not exist: say so and close the sheet
  const missing = selected !== null && hasCode(detail.error, 'USER_NOT_FOUND');
  useEffect(() => {
    if (missing) {
      toast.error('Không tìm thấy người dùng này.');
      select(null);
    }
  }, [missing, select]);

  const o = overview.data?.users;
  const roleTabs: { value: Role | 'ALL'; label: string; count?: number }[] = [
    { value: 'ALL', label: 'Tất cả', count: o?.total },
    { value: 'READER', label: 'Người đọc', count: o?.byRole.READER },
    { value: 'AUTHOR', label: 'Tác giả', count: o?.byRole.AUTHOR },
    { value: 'ADMIN', label: 'Admin', count: o?.byRole.ADMIN },
  ];
  const statusTabs: { value: UserStatus | 'ALL'; label: string; count?: number }[] = [
    { value: 'ALL', label: 'Mọi trạng thái' },
    { value: 'ACTIVE', label: 'Hoạt động', count: o ? o.total - o.banned : undefined },
    { value: 'BANNED', label: 'Bị khoá', count: o?.banned },
  ];

  const askLock = (t: LockTarget) => setLock(t);
  const confirmUnban = () =>
    lock && actions.unban.mutate(lock.userId, { onSettled: () => setLock(null) });
  const confirmBan = (reason: string) =>
    lock && actions.ban.mutate({ userId: lock.userId, reason }, { onSettled: () => setLock(null) });

  const items = list.data?.items ?? [];
  const filtered = !!(filters.q || filters.role || filters.status || filters.from || filters.to);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Người dùng</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus strokeWidth={1.75} /> Tạo admin
        </Button>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AdminSearch value={filters.q} onSearch={(q) => update({ q })} label="Tìm người dùng" placeholder="Tìm tên, username hoặc email" />
          <AdminFilterTabs label="Vai trò" tabs={roleTabs} value={filters.role ?? 'ALL'} onChange={(v) => update({ role: v === 'ALL' ? undefined : v })} />
          <AdminFilterTabs label="Trạng thái" tabs={statusTabs} value={filters.status ?? 'ALL'} onChange={(v) => update({ status: v === 'ALL' ? undefined : v })} />
        </div>
        <fieldset className="flex flex-wrap items-center gap-2 text-label">
          <legend className="sr-only">Ngày đăng ký</legend>
          <span aria-hidden className="text-muted-foreground">
            Đăng ký từ
          </span>
          <AdminDateField label="Đăng ký từ ngày" placeholder="Ngày bắt đầu" value={filters.from} max={filters.to} onChange={(from) => update({ from })} />
          <span aria-hidden className="text-muted-foreground">
            đến
          </span>
          <AdminDateField label="Đăng ký đến ngày" placeholder="Hôm nay" value={filters.to} min={filters.from} onChange={(to) => update({ to })} />
        </fieldset>
      </div>

      {list.isError ? (
        <ErrorResult title="Chưa tải được danh sách người dùng" onRetry={() => list.refetch()} />
      ) : (
        <section aria-label="Danh sách người dùng" aria-busy={list.isFetching} className={TABLE}>
          <div className={cn(TABLE_HEAD_XL, USER_GRID)}>
            <span>Người dùng</span>
            <span>Vai trò</span>
            <span>Trạng thái</span>
            <span>Ngày đăng ký</span>
            <span />
          </div>
          {!list.data ? (
            <ul aria-label="Đang tải">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-border px-5 py-3">
                  <Skeleton className="size-10 rounded-full bg-secondary" />
                  <Skeleton className="h-4 w-64 bg-secondary" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 border-t border-border px-5 py-12 text-center text-muted-foreground">
              <p>{filtered ? 'Không có người dùng nào khớp bộ lọc.' : 'Chưa có người dùng nào.'}</p>
              {filtered && (
                <Button variant="outline" size="sm" onClick={() => update({ q: '', role: undefined, status: undefined, from: undefined, to: undefined })}>
                  Xoá bộ lọc
                </Button>
              )}
            </div>
          ) : (
            <ul>
              {items.map((u) => (
                <UserRow
                  key={u.userId}
                  user={u}
                  self={u.userId === me?.userId}
                  onOpen={() => select(u.userId)}
                  onToggleLock={() => askLock({ userId: u.userId, username: u.username, banned: u.status === 'BANNED' })}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {list.data && list.data.totalElements > 0 && (
        <AppPagination page={list.data.page} totalPages={list.data.totalPages} totalElements={list.data.totalElements} unit="người dùng" onPageChange={setPage} />
      )}

      <UserDetailSheet
        open={selected !== null}
        onOpenChange={(o) => !o && select(null)}
        user={detail.data}
        error={detail.isError && !missing}
        self={selected === me?.userId}
        onToggleLock={() => detail.data && askLock({ userId: detail.data.userId, username: detail.data.username, banned: detail.data.status === 'BANNED' })}
        onVerify={(isVerified) => selected && actions.verify.mutate({ userId: selected, isVerified })}
        verifying={actions.verify.isPending}
      />

      <ReasonDialog
        open={!!lock && !lock.banned}
        onOpenChange={(o) => !o && !actions.ban.isPending && setLock(null)}
        title={`Khoá tài khoản @${lock?.username ?? ''}?`}
        description="Người dùng sẽ bị đăng xuất và không đăng nhập lại được cho đến khi bạn mở khoá. Lý do được lưu lại."
        reasons={BAN_REASONS}
        notePlaceholder="Ghi chú thêm (không bắt buộc)"
        confirmLabel="Khoá tài khoản"
        pendingLabel="Đang khoá…"
        pending={actions.ban.isPending}
        onConfirm={confirmBan}
      />
      <ConfirmDialog
        open={!!lock && lock.banned}
        onOpenChange={(o) => !o && !actions.unban.isPending && setLock(null)}
        title={`Mở khoá tài khoản @${lock?.username ?? ''}?`}
        description="Người dùng có thể đăng nhập lại ngay sau khi bạn xác nhận."
        confirmLabel="Mở khoá"
        pendingLabel="Đang mở khoá…"
        pending={actions.unban.isPending}
        onConfirm={confirmUnban}
      />
      <CreateAdminDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={(v) => actions.create.mutateAsync(v)} />
    </div>
  );
}
