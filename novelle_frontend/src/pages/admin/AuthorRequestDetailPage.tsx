import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { approveRequest, getAdminRequest, rejectRequest } from '@/api/authorRequests';
import { queryKeys } from '@/api/queryKeys';
import { RequestStatusBadge } from '@/components/author/RequestStatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorResult } from '@/components/common/ErrorResult';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useDocumentTitle } from '@/hooks/useCatalog';
import { cn } from '@/lib/utils';
import {
  REQUEST_STATUS_LABEL,
  rejectSchema,
  requestCode,
  REVIEW_NOTE_MAX,
  type AdminAuthorRequestDetail,
  type RejectValues,
} from '@/types/authorRequest';
import { ROLE_LABEL } from '@/types/user';
import { errorMessage, hasCode } from '@/utils/errors';
import { formatDate, formatDateTime, formatNumber, formatTime } from '@/utils/format';

const card = 'flex flex-col gap-3.5 rounded-lg border border-border bg-card p-6';

type Banner = { tone: 'warning' | 'critical'; title: string; text: string } | null;

/**
 * AD4 · Chi tiết yêu cầu (/admin/author-requests/:requestId, board AdminRequestDetail): request content,
 * counts of the applicant's other requests, the applicant card; a pending request gets "Từ chối" (dialog
 * with an optional note ≤ 500) and "Duyệt yêu cầu" (confirm). Conflicts (another admin, pen name taken,
 * applicant no longer an active reader) show a banner and reload the request.
 */
export default function AuthorRequestDetailPage() {
  const raw = useParams().requestId ?? '';
  const requestId = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  const queryClient = useQueryClient();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [result, setResult] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: queryKeys.admin.authorRequests.detail(requestId ?? 0),
    queryFn: () => getAdminRequest(requestId!),
    enabled: requestId !== null,
    refetchOnWindowFocus: true,
    retry: (count, e) => count < 1 && !hasCode(e, 'AUTHOR_REQUEST_NOT_FOUND', 'NOT_FOUND'),
  });
  const d = detail.data;
  useDocumentTitle(d ? `Yêu cầu của @${d.applicant.username}` : 'Chi tiết yêu cầu');

  const rejectForm = useForm<RejectValues>({ resolver: zodResolver(rejectSchema), defaultValues: { note: '' } });

  const done = (next: AdminAuthorRequestDetail, text: string) => {
    queryClient.setQueryData(queryKeys.admin.authorRequests.detail(next.requestId), next);
    // The queue and the counter changed; this detail was just set from the response.
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.authorRequests.all, 'list'] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.authorRequests.pendingCount });
    setBanner(null);
    setResult(text);
    toast.success(text);
  };

  const conflict = (e: unknown) => {
    setApproveOpen(false);
    setRejectOpen(false);
    if (hasCode(e, 'ALREADY_PROCESSED')) {
      setBanner({ tone: 'warning', title: 'Yêu cầu đã được admin khác xử lý', text: 'Trang đã tải lại trạng thái mới nhất của yêu cầu.' });
    } else if (hasCode(e, 'PEN_NAME_TAKEN')) {
      setBanner({
        tone: 'warning',
        title: 'Bút danh đã có người dùng',
        text: 'Một tác giả khác vừa dùng bút danh này. Hãy từ chối kèm ghi chú để người dùng chọn bút danh khác.',
      });
    } else if (hasCode(e, 'REVIEW_IN_PROGRESS')) {
      setBanner({ tone: 'warning', title: 'Admin khác đang xử lý yêu cầu này', text: 'Thử lại sau ít phút.' });
    } else if (hasCode(e, 'FORBIDDEN')) {
      setBanner({
        tone: 'critical',
        title: 'Không duyệt được yêu cầu này',
        text: 'Người gửi không còn là người đọc đang hoạt động (đã bị khoá hoặc đã đổi vai trò).',
      });
    } else {
      toast.error(errorMessage(e));
      return;
    }
    void detail.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.authorRequests.all });
  };

  const approve = useMutation({
    mutationFn: () => approveRequest(requestId!),
    onSuccess: (next) => {
      setApproveOpen(false);
      done(next, `Đã duyệt. @${next.applicant.username} hiện là tác giả.`);
    },
    onError: conflict,
  });

  const reject = useMutation({
    mutationFn: (v: RejectValues) => rejectRequest(requestId!, v.note),
    onSuccess: (next) => {
      setRejectOpen(false);
      rejectForm.reset({ note: '' });
      done(next, 'Đã từ chối. Người dùng sẽ thấy ghi chú của bạn.');
    },
    onError: conflict,
  });

  if (requestId === null || (detail.isError && hasCode(detail.error, 'AUTHOR_REQUEST_NOT_FOUND', 'NOT_FOUND'))) {
    return (
      <ErrorResult
        variant="not-found"
        title="Không tìm thấy yêu cầu này"
        action={
          <Button asChild>
            <Link to="/admin/author-requests">Về danh sách yêu cầu</Link>
          </Button>
        }
      />
    );
  }
  if (detail.isError) return <ErrorResult title="Chưa tải được yêu cầu" onRetry={() => detail.refetch()} />;
  if (!d) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Đang tải yêu cầu">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-[320px] rounded-lg" />
      </div>
    );
  }

  const canAct = d.status === 'PENDING';
  const others = d.otherRequests;
  const otherRows = (
    [
      ['REJECTED', others.rejected],
      ['CANCELLED', others.cancelled],
      ['APPROVED', others.approved],
      ['PENDING', others.pending],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5">
        <nav aria-label="Đường dẫn" className="text-small text-muted-foreground">
          <Link to="/admin/author-requests" className="hover:text-foreground hover:underline">
            Yêu cầu tác giả
          </Link>{' '}
          › Yêu cầu của @{d.applicant.username}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="font-serif text-[28px] leading-9 font-semibold tracking-[-0.01em] sm:text-[32px] sm:leading-[38px]">
              Yêu cầu của @{d.applicant.username}
            </h1>
            <RequestStatusBadge status={d.status} size="lg" />
          </div>
          {canAct && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                Từ chối
              </Button>
              <Button className="font-semibold" onClick={() => setApproveOpen(true)}>
                <Check strokeWidth={2} /> Duyệt yêu cầu
              </Button>
            </div>
          )}
        </div>
        <p className="text-muted-foreground">
          Gửi lúc {formatTime(d.createdAt)}, {formatDate(d.createdAt)} · mã {requestCode(d.requestId)}
          {d.reviewedAt && (
            <>
              {' '}
              · {REQUEST_STATUS_LABEL[d.status].toLowerCase()} lúc {formatDateTime(d.reviewedAt)}
              {d.reviewer && ` bởi @${d.reviewer.username}`}
            </>
          )}
        </p>
      </header>

      {banner && (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-3 rounded-md px-4 py-3.5 text-label',
            banner.tone === 'warning' ? 'bg-warning-soft text-nghe-ink' : 'bg-critical-soft text-destructive',
          )}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={1.75} />
          <span>
            <b>{banner.title}</b>
            <br />
            <span className="text-foreground">{banner.text}</span>
          </span>
        </div>
      )}
      {result && (
        <div
          role="status"
          className={cn('rounded-md px-4 py-3.5 text-label font-semibold', d.status === 'APPROVED' ? 'bg-success-soft text-success' : 'bg-critical-soft text-destructive')}
        >
          {result}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          <section aria-labelledby="req-content" className={card}>
            <h2 id="req-content" className="font-serif text-[20px] leading-[26px] font-semibold">
              Nội dung yêu cầu
            </h2>
            <div className="flex flex-col gap-1.5">
              <span className="text-small text-muted-foreground">Bút danh đề xuất</span>
              <span className="font-serif text-[28px] leading-9 font-semibold break-words italic sm:text-[32px] sm:leading-10">{d.proposedPenName}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-small text-muted-foreground">Giới thiệu bản thân</span>
              <p className="font-serif text-[17px] leading-7 whitespace-pre-line">{d.introduction}</p>
            </div>
            {d.reviewNote && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small text-muted-foreground">Ghi chú khi từ chối</span>
                <p className="whitespace-pre-line">{d.reviewNote}</p>
              </div>
            )}
          </section>
          <section aria-labelledby="req-others" className={card}>
            <h2 id="req-others" className="font-serif text-[20px] leading-[26px] font-semibold">
              Yêu cầu khác của người này
            </h2>
            {otherRows.length === 0 ? (
              <p className="text-muted-foreground">Đây là yêu cầu đầu tiên của người dùng này.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {otherRows.map(([status, n]) => (
                  <li key={status}>
                    <RequestStatusBadge status={status} className="h-7 px-3 text-small" />{' '}
                    <span className="num text-label">× {formatNumber(n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section aria-labelledby="req-applicant" className={cn(card, 'min-w-0 flex-[1_1_320px]')}>
          <h2 id="req-applicant" className="font-serif text-[20px] leading-[26px] font-semibold">
            Người gửi
          </h2>
          <div className="flex items-center gap-3.5">
            <UserAvatar name={d.applicant.username} avatarUrl={d.applicant.avatarUrl} size="md" className="size-14 text-[20px]" />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold">@{d.applicant.username}</div>
              <div className="text-label text-muted-foreground">{ROLE_LABEL[d.applicant.role]}</div>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-label">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="truncate text-right">{d.applicant.email}</dd>
            <dt className="text-muted-foreground">Tham gia</dt>
            <dd className="text-right">{formatDate(d.applicant.joinedAt)}</dd>
            <dt className="text-muted-foreground">Tài khoản</dt>
            <dd className="text-right">
              <Badge variant={d.applicant.status === 'ACTIVE' ? 'success' : 'critical'} className="rounded-full px-2.5 font-semibold">
                {d.applicant.status === 'ACTIVE' ? 'Hoạt động' : 'Bị khoá'}
              </Badge>
            </dd>
          </dl>
          <Link to={`/users/${d.applicant.username}`} className="text-label text-link hover:underline">
            Xem hồ sơ công khai
          </Link>
        </section>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Duyệt yêu cầu này?"
        description={`@${d.applicant.username} sẽ trở thành tác giả với bút danh “${d.proposedPenName}” và vào được Studio ngay.`}
        confirmLabel="Duyệt"
        pendingLabel="Đang duyệt…"
        pending={approve.isPending}
        onConfirm={() => approve.mutate()}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Từ chối yêu cầu"
        description="Yêu cầu sẽ chuyển sang trạng thái từ chối. Người dùng có thể gửi lại."
        confirmLabel="Từ chối"
        pendingLabel="Đang từ chối…"
        destructive
        pending={reject.isPending}
        onConfirm={() => void rejectForm.handleSubmit((v) => reject.mutate(v))()}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-note">Ghi chú gửi người dùng</Label>
          <Textarea
            id="reject-note"
            rows={4}
            maxLength={REVIEW_NOTE_MAX + 50}
            placeholder="Ví dụ: phần giới thiệu còn quá ngắn, bạn bổ sung thêm rồi gửi lại nhé."
            aria-invalid={!!rejectForm.formState.errors.note || undefined}
            {...rejectForm.register('note')}
          />
          {rejectForm.formState.errors.note ? (
            <p className="text-small text-destructive">{rejectForm.formState.errors.note.message}</p>
          ) : (
            <span className="text-small text-muted-foreground">Người dùng sẽ thấy ghi chú này khi gửi lại yêu cầu.</span>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
