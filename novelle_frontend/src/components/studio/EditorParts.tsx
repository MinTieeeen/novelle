import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { AutosaveStatus } from '@/hooks/useAutosave';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber, formatTime } from '@/utils/format';

interface SaveStatusProps {
  /** changes not saved with "Lưu" yet */
  dirty: boolean;
  saving: boolean;
  autosave: AutosaveStatus;
  draftSavedAt?: string | null;
  /** last C6 (or the chapter's version when opened) */
  savedAt?: string | null;
}

/**
 * Save state of the editor header (board ChapterEditor): "Đang lưu…", "Đã lưu 14:32", "Đã lưu nháp 14:32",
 * "Chưa lưu thay đổi", "Chưa lưu được bản nháp". A nghe dot marks unsaved changes.
 */
export function SaveStatus({ dirty, saving, autosave, draftSavedAt, savedAt }: SaveStatusProps) {
  let text: string;
  let tone: 'muted' | 'warn' | 'ok' = 'muted';
  if (saving) text = 'Đang lưu…';
  else if (dirty && autosave === 'saving') text = 'Đang lưu nháp…';
  else if (dirty && autosave === 'failed') {
    text = 'Chưa lưu được bản nháp';
    tone = 'warn';
  } else if (dirty && autosave === 'saved' && draftSavedAt) text = `Đã lưu nháp ${formatTime(draftSavedAt)}`;
  else if (dirty) {
    text = 'Chưa lưu thay đổi';
    tone = 'warn';
  } else {
    text = savedAt ? `Đã lưu ${formatTime(savedAt)}` : 'Đã lưu';
    tone = 'ok';
  }
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-small whitespace-nowrap', tone === 'warn' ? 'text-nghe-ink' : 'text-muted-foreground')}>
      {saving || autosave === 'saving' ? (
        <Loader2 aria-hidden className="size-3.5 animate-spin" strokeWidth={1.75} />
      ) : (
        <span aria-hidden className={cn('size-2 rounded-full', tone === 'ok' ? 'bg-success' : tone === 'warn' ? 'bg-nghe' : 'bg-input')} />
      )}
      {text}
    </span>
  );
}

interface DraftBannerProps {
  savedAt: string;
  /** visible characters of the draft minus those of the saved chapter */
  diff: number;
  onRestore: () => void;
  onDiscard: () => void;
  busy?: boolean;
}

/** "Có bản nháp chưa lưu từ 14:20 hôm nay …" (board ChapterEditor, panel "Bản nháp chưa lưu"). */
export function DraftBanner({ savedAt, diff, onRestore, onDiscard, busy }: DraftBannerProps) {
  const today = formatDate(savedAt) === formatDate(new Date().toISOString());
  const when = `${formatTime(savedAt)} ${today ? 'hôm nay' : formatDate(savedAt)}`;
  const delta = diff === 0 ? 'cùng độ dài với' : `${diff > 0 ? 'nhiều hơn' : 'ít hơn'} ${formatNumber(Math.abs(diff))} kí tự so với`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-nghe/40 bg-nghe-soft px-4 py-2.5 text-label text-nghe-ink sm:px-6">
      <span className="min-w-0 flex-1">
        Có bản nháp chưa lưu từ <b>{when}</b>, {delta} bản đang mở.
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={onRestore} disabled={busy}>
          Khôi phục bản nháp
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy} className="text-nghe-ink hover:bg-nghe/15">
          Bỏ qua
        </Button>
      </div>
    </div>
  );
}

interface ConflictDialogProps {
  open: boolean;
  /** "Tải bản mới nhất": keeps my text as a draft first */
  onLoadLatest: () => void;
  /** "Ghi đè bằng bản của tôi" */
  onOverwrite: () => void;
  pending?: 'load' | 'overwrite' | null;
}

/**
 * 409 STALE_DATA on "Lưu" (board ChapterEditor, panel Xung đột): no way out but one of the two choices,
 * so Esc and the backdrop do nothing.
 */
export function ConflictDialog({ open, onLoadLatest, onOverwrite, pending }: ConflictDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[480px] gap-5 sm:max-w-[480px]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="flex items-center gap-2 font-serif text-title-3">
            <CircleAlert aria-hidden className="size-5 text-destructive" strokeWidth={1.75} />
            Chương đã được sửa ở nơi khác
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body text-muted-foreground">
            Bản trên máy chủ mới hơn bản bạn đang soạn. Bạn chọn tải bản mới nhất (bản đang soạn được giữ lại thành bản nháp) hoặc ghi đè bằng nội dung hiện
            tại. Bản trên máy chủ sẽ được lưu vào lịch sử trước khi ghi đè.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onLoadLatest} disabled={!!pending}>
            {pending === 'load' && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
            Tải bản mới nhất
          </Button>
          <Button onClick={onOverwrite} disabled={!!pending}>
            {pending === 'overwrite' && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
            Ghi đè bằng bản của tôi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
