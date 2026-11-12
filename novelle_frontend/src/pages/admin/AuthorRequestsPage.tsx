import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { getAdminRequests } from '@/api/authorRequests';
import { queryKeys } from '@/api/queryKeys';
import { AppPagination } from '@/components/common/AppPagination';
import { ErrorResult } from '@/components/common/ErrorResult';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingRequestCount } from '@/hooks/usePendingRequestCount';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import { REQUEST_STATUSES, REQUEST_STATUS_LABEL, waitingLabel, type AuthorRequestStatus } from '@/types/authorRequest';
import { formatDate, formatNumber } from '@/utils/format';

const PAGE_SIZE = 20;
/* Table columns from 1024px (board AdminRequests); written out twice so Tailwind sees both class lists. */
const COLS = 'grid grid-cols-[minmax(0,1fr)_200px_130px_170px_88px] items-center gap-4 px-5';
const COLS_LG = 'lg:grid lg:grid-cols-[minmax(0,1fr)_200px_130px_170px_88px] lg:items-center lg:gap-4 lg:px-5';

function parseStatus(v: string | null): AuthorRequestStatus {
  return REQUEST_STATUSES.includes(v as AuthorRequestStatus) ? (v as AuthorRequestStatus) : 'PENDING';
}

/**
 * AD3 · Yêu cầu tác giả (/admin/author-requests?status=&page=, board AdminRequests): status tabs (count on
 * "Chờ duyệt" only), the queue (applicant, pen name, sent date + waiting time, "Từng bị từ chối"), paging.
 * Pending is oldest first, the others newest first (backend order). Below 1024px rows become cards.
 */
export default function AuthorRequestsPage() {
  useDocumentTitle('Yêu cầu tác giả');
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get('status'));
  const page = Math.max(0, Number(params.get('page')) || 0);
  const pendingCount = usePendingRequestCount();

  const query = { status, page, size: PAGE_SIZE };
  const list = useQuery({
    queryKey: queryKeys.admin.authorRequests.list(query),
    queryFn: () => getAdminRequests(query),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });

  const go = (next: { status?: AuthorRequestStatus; page?: number }) => {
    const p = new URLSearchParams();
    const s = next.status ?? status;
    if (s !== 'PENDING') p.set('status', s);
    const pg = next.page ?? 0;
    if (pg > 0) p.set('page', String(pg));
    setParams(p, { replace: next.page === undefined });
  };

  const pending = status === 'PENDING';
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Yêu cầu tác giả</h1>
        <p className="mt-1 text-muted-foreground">Duyệt người dùng muốn trở thành tác giả</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Trạng thái yêu cầu" className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-[10px] bg-secondary p-[3px]">
          {REQUEST_STATUSES.map((s) => {
            const on = s === status;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => go({ status: s })}
                className={cn(
                  'h-[34px] shrink-0 rounded-md px-3.5 text-label font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
                  on ? 'bg-card text-primary shadow-[0_1px_2px_rgb(31_33_96/0.12)]' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {REQUEST_STATUS_LABEL[s]}
                {s === 'PENDING' && pendingCount != null && <span className="num font-normal text-muted-foreground"> {formatNumber(pendingCount)}</span>}
              </button>
            );
          })}
        </div>
        <span className="text-label text-muted-foreground">{pending ? 'Cũ nhất trước' : 'Mới nhất trước'}</span>
      </div>

      {list.isError ? (
        <ErrorResult title="Chưa tải được danh sách yêu cầu" onRetry={() => list.refetch()} />
      ) : (
        <section aria-label="Danh sách yêu cầu" aria-busy={list.isFetching} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className={cn(COLS, 'bg-secondary py-3 text-small font-semibold text-muted-foreground max-lg:hidden')}>
            <span>Người gửi</span>
            <span>Bút danh</span>
            <span>Ngày gửi</span>
            <span>Ghi chú</span>
            <span />
          </div>
          {list.isPending ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-border px-5 py-4">
                <Skeleton className="h-10" />
              </div>
            ))
          ) : list.data.items.length === 0 ? (
            <p className="border-t border-border px-5 py-14 text-center text-muted-foreground">Không có yêu cầu nào trong mục này.</p>
          ) : (
            <ul>
              {list.data.items.map((r) => {
                const to = `/admin/author-requests/${r.requestId}`;
                return (
                  <li
                    key={r.requestId}
                    className={cn('border-t border-border py-3.5 text-label', COLS_LG, 'max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-x-4 max-lg:gap-y-2 max-lg:px-4')}
                  >
                    <Link to={to} className="flex min-w-0 items-center gap-3 max-lg:basis-full">
                      <UserAvatar name={r.applicant.username} avatarUrl={r.applicant.avatarUrl} size="md" />
                      <span className="truncate font-semibold">@{r.applicant.username}</span>
                    </Link>
                    <span className="truncate font-serif text-base font-semibold">{r.proposedPenName}</span>
                    <span className="flex flex-col">
                      <span>{formatDate(r.createdAt)}</span>
                      {r.status === 'PENDING' && <span className="text-caption text-nghe-ink">{waitingLabel(r.createdAt)}</span>}
                    </span>
                    <span>
                      {r.previouslyRejected && (
                        <Badge className="rounded-full bg-nghe-soft px-2.5 font-semibold text-nghe-ink">Từng bị từ chối</Badge>
                      )}
                    </span>
                    <Link
                      to={to}
                      aria-label={`${r.status === 'PENDING' ? 'Xem' : 'Xem lại'} yêu cầu của @${r.applicant.username}`}
                      className="inline-flex h-[34px] items-center justify-center rounded-md border border-input px-3 text-small font-medium transition-colors hover:bg-secondary max-lg:ml-auto"
                    >
                      {r.status === 'PENDING' ? 'Xem' : 'Xem lại'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {list.data && (
        <AppPagination
          page={list.data.page}
          totalPages={list.data.totalPages}
          totalElements={list.data.totalElements}
          unit="yêu cầu"
          onPageChange={(p) => go({ page: p })}
        />
      )}
    </div>
  );
}
