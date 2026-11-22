import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock3, PenTool } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cancelRequest, getMyRequests, submitRequest } from '@/api/authorRequests';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth/AuthProvider';
import { AuthorRequestForm } from '@/components/author/AuthorRequestForm';
import { RequestStatusBadge } from '@/components/author/RequestStatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCooldown } from '@/hooks/useCooldown';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import { currentRequest, type AuthorRequest } from '@/types/authorRequest';
import { errorMessage, hasCode, retryAfterSeconds } from '@/utils/errors';
import { formatDate, formatDateTime } from '@/utils/format';

const card = 'flex flex-col rounded-lg border border-border bg-card';

/** Status card of the newest request when it is pending or approved (board BecomeAuthor). */
function StatusCard({ request, onCancel, cancelling }: { request: AuthorRequest; onCancel: () => void; cancelling: boolean }) {
  const approved = request.status === 'APPROVED';
  const Icon = approved ? CircleCheck : Clock3;
  return (
    <section aria-labelledby="req-status" className={cn(card, 'gap-5 p-6 sm:p-7')}>
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className={cn('grid size-14 flex-none place-items-center rounded-full', approved ? 'bg-success-soft text-success' : 'bg-nghe-soft text-nghe-ink')}
        >
          <Icon className="size-7" strokeWidth={1.75} />
        </span>
        <div>
          <h2 id="req-status" className="font-serif text-[20px] leading-[26px] font-semibold">
            {approved ? 'Yêu cầu đã được duyệt' : 'Đang chờ duyệt'}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {approved ? 'Bạn đã là tác giả. Vào Studio để tạo truyện đầu tiên.' : 'Chúng tôi sẽ xem xét yêu cầu của bạn, thường trong 1–2 ngày.'}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-md bg-secondary p-4 text-label">
        <dt className="text-muted-foreground">Bút danh</dt>
        <dd className="font-serif text-base font-semibold italic">{request.proposedPenName}</dd>
        <dt className="text-muted-foreground">Ngày gửi</dt>
        <dd>{formatDateTime(request.createdAt)}</dd>
        <dt className="text-muted-foreground">Giới thiệu</dt>
        <dd className="line-clamp-3 whitespace-pre-line">{request.introduction}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        {approved ? (
          <Button asChild className="font-semibold">
            <Link to="/studio">
              <PenTool strokeWidth={1.75} /> Vào Studio
            </Link>
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onCancel} disabled={cancelling}>
              Huỷ yêu cầu
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function History({ requests }: { requests: AuthorRequest[] }) {
  return (
    <section aria-labelledby="req-history" className={cn(card, 'gap-1 p-6')}>
      <h2 id="req-history" className="mb-2 font-serif text-[20px] leading-[26px] font-semibold">
        Lịch sử yêu cầu
      </h2>
      <ul>
        {requests.map((r) => (
          <li key={r.requestId} className="flex flex-col gap-1.5 border-t border-border py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">
                {formatDate(r.createdAt)} · bút danh “{r.proposedPenName}”
              </span>
              <RequestStatusBadge status={r.status} />
            </div>
            <p className="text-label text-muted-foreground">
              {r.status === 'REJECTED'
                ? r.reviewNote
                  ? `Ghi chú từ admin: “${r.reviewNote}”`
                  : 'Admin không để lại ghi chú.'
                : r.status === 'CANCELLED'
                  ? 'Bạn đã tự huỷ yêu cầu.'
                  : r.status === 'APPROVED'
                    ? 'Yêu cầu được duyệt. Chào mừng bạn đến với Studio!'
                    : 'Đang chờ duyệt.'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * R10 · Trở thành tác giả (/become-author, READER; board BecomeAuthor). The newest request decides the
 * screen: none / rejected / cancelled → form (a rejection shows the admin's note and prefills the form),
 * pending → status card + "Huỷ yêu cầu", approved → "Vào Studio". The list refetches when the tab gets
 * focus; an approval refreshes the session so the header switches to Studio.
 */
export default function BecomeAuthorPage() {
  useDocumentTitle('Trở thành tác giả');
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cooldown = useCooldown();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const requests = useQuery({
    queryKey: queryKeys.authorRequests.mine,
    queryFn: getMyRequests,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const current = requests.data ? currentRequest(requests.data) : null;

  // Approved while the session still says READER: reload /me so the header shows "Studio".
  const approved = current?.status === 'APPROVED';
  useEffect(() => {
    if (approved && user?.role === 'READER') void refresh();
  }, [approved, user?.role, refresh]);

  const setMine = (r: AuthorRequest) =>
    queryClient.setQueryData<AuthorRequest[]>(queryKeys.authorRequests.mine, (list) => [r, ...(list ?? []).filter((x) => x.requestId !== r.requestId)]);

  async function submit(body: { proposedPenName: string; introduction: string }) {
    try {
      const r = await submitRequest(body);
      setMine(r);
      toast.success('Đã gửi yêu cầu. Admin sẽ xem xét trong 1–2 ngày.');
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (hasCode(e, 'REQUEST_ALREADY_PENDING')) {
        toast.info('Bạn đang có một yêu cầu chờ duyệt.');
        void requests.refetch();
      } else if (hasCode(e, 'ONLY_READER_CAN_REQUEST')) {
        toast.info('Tài khoản của bạn không còn là người đọc.');
        await refresh();
        navigate('/', { replace: true });
      } else if (hasCode(e, 'RATE_LIMITED')) {
        cooldown.start(retryAfterSeconds(e) ?? 60);
      } else if (!hasCode(e, 'PEN_NAME_TAKEN', 'VALIDATION_FAILED')) toast.error(errorMessage(e));
      throw e;
    }
  }

  const cancel = useMutation({
    mutationFn: (id: number) => cancelRequest(id),
    onSuccess: (r) => {
      setConfirmCancel(false);
      setMine(r);
      toast.success('Đã huỷ yêu cầu.');
    },
    onError: (e) => {
      setConfirmCancel(false);
      if (hasCode(e, 'ALREADY_PROCESSED')) toast.info('Yêu cầu vừa được admin xử lý.');
      else toast.error(errorMessage(e));
      void requests.refetch();
    },
  });

  const showForm = !current || current.status === 'REJECTED' || current.status === 'CANCELLED';
  const rejected = current?.status === 'REJECTED' ? current : null;
  const history = (requests.data ?? []).filter((r) => r !== current || showForm);

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-7">
      <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">Trở thành tác giả</h1>

      {requests.isPending ? (
        <Skeleton className="h-[420px] rounded-lg" />
      ) : requests.isError ? (
        <ErrorResult title="Chưa tải được yêu cầu của bạn" onRetry={() => requests.refetch()} />
      ) : showForm ? (
        <div className={cn(card, 'gap-5 p-6 sm:p-8')}>
          {rejected && (
            <div role="alert" className="rounded-md bg-critical-soft px-4 py-3.5 text-label text-destructive">
              <b>Yêu cầu trước bị từ chối</b>
              <br />
              <span className="text-foreground">
                {rejected.reviewNote ? `Ghi chú từ admin: “${rejected.reviewNote}”` : 'Admin không để lại ghi chú. Bạn có thể bổ sung rồi gửi lại.'}
              </span>
            </div>
          )}
          <AuthorRequestForm
            key={current?.requestId ?? 'new'}
            defaultValues={rejected ? { proposedPenName: rejected.proposedPenName, introduction: rejected.introduction } : undefined}
            onSubmit={submit}
            cooldown={cooldown.remaining}
          />
        </div>
      ) : (
        current && <StatusCard request={current} onCancel={() => setConfirmCancel(true)} cancelling={cancel.isPending} />
      )}

      {history.length > 0 && <History requests={history} />}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Huỷ yêu cầu này?"
        description="Yêu cầu sẽ chuyển sang trạng thái đã huỷ. Bạn có thể gửi yêu cầu mới bất cứ lúc nào."
        cancelLabel="Giữ yêu cầu"
        confirmLabel="Huỷ yêu cầu"
        pendingLabel="Đang huỷ…"
        destructive
        pending={cancel.isPending}
        onConfirm={() => current && cancel.mutate(current.requestId)}
      />
    </div>
  );
}
