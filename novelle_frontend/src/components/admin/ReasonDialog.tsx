import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { composeReason, OTHER_REASON, REASON_MAX, reasonSchema } from '@/types/admin';
import { formatNumber } from '@/utils/format';

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** chips of the board (BAN_REASONS / HIDE_REASONS) */
  reasons: readonly string[];
  notePlaceholder: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  /** the composed reason (decision 1) */
  onConfirm: (reason: string) => void;
}

/**
 * "Khoá tài khoản" / "Ẩn truyện" (AdminUsers, AdminStories boards): a required reason chip (`aria-pressed`)
 * and an optional note ("Khác" makes it required); sent as "Chip" or "Chip: note", ≤ 500 characters.
 */
export function ReasonDialog({ open, onOpenChange, title, description, reasons, notePlaceholder, confirmLabel, pendingLabel, pending, onConfirm }: ReasonDialogProps) {
  const [chip, setChip] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<{ field: 'chip' | 'note'; message: string } | null>(null);
  useEffect(() => {
    if (open) {
      setChip('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const length = chip ? composeReason(chip, note).length : note.trim().length;
  const confirm = () => {
    const r = reasonSchema.safeParse({ chip, note });
    if (!r.success) {
      const issue = r.error.issues[0];
      setError({ field: issue.path[0] === 'chip' ? 'chip' : 'note', message: issue.message });
      return;
    }
    onConfirm(composeReason(chip, note));
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      destructive
      pending={pending}
      onConfirm={confirm}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-label font-semibold">Lý do (bắt buộc)</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lý do" aria-describedby={error?.field === 'chip' ? 'reason-error' : undefined}>
          {reasons.map((r) => {
            const on = chip === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setChip(r);
                  setError(null);
                }}
                className={cn(
                  'h-[34px] rounded-full border px-3.5 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid',
                  on ? 'border-destructive bg-critical-soft text-destructive' : 'border-input bg-card hover:bg-secondary',
                  error?.field === 'chip' && 'border-destructive',
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        <Textarea
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          aria-label={chip === OTHER_REASON ? 'Lý do cụ thể' : 'Ghi chú thêm'}
          aria-invalid={error?.field === 'note' || undefined}
          aria-describedby={error?.field === 'note' ? 'reason-error' : undefined}
          placeholder={chip === OTHER_REASON ? 'Ghi rõ lý do' : notePlaceholder}
          className="resize-y"
        />
        <div className="flex justify-between gap-3 text-small">
          {error ? (
            <p id="reason-error" role="alert" className="text-destructive">
              {error.message}
            </p>
          ) : (
            <span className="text-muted-foreground">Lý do được lưu lại và người liên quan sẽ thấy.</span>
          )}
          <span className={cn('num ml-auto shrink-0', length > REASON_MAX ? 'text-destructive' : 'text-muted-foreground')}>
            {formatNumber(length)}/{REASON_MAX}
          </span>
        </div>
      </fieldset>
    </ConfirmDialog>
  );
}
