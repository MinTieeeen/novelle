import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { Revision } from '@/types/studio';
import { formatDate, formatNumber, formatTime } from '@/utils/format';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import '@/styles/reader.css';

interface RevisionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** R1; undefined while loading */
  revisions?: Revision[];
  error?: boolean;
  onView: (r: Revision) => void;
  onRestore: (r: Revision) => void;
}

/**
 * "Lịch sử bản sửa" (board ChapterEditor, panel Lịch sử): side sheet with the 10 newest revisions (time,
 * words, editor); "Xem" opens it read-only, "Khôi phục" asks first.
 */
export function RevisionPanel({ open, onOpenChange, revisions, error, onView, onRestore }: RevisionPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[360px] gap-0 p-0 sm:max-w-[360px]">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-serif text-title-3">Lịch sử bản sửa</SheetTitle>
          <SheetDescription>Lưu tối đa 10 bản gần nhất. Mỗi lần bấm “Lưu” tạo một bản.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error && <p className="px-3 py-4 text-label text-muted-foreground">Không tải được lịch sử.</p>}
          {!revisions && !error && (
            <div className="flex flex-col gap-3 px-3 py-3" aria-label="Đang tải lịch sử">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 bg-secondary" />
              ))}
            </div>
          )}
          {revisions?.length === 0 && <p className="px-3 py-4 text-label text-muted-foreground">Chưa có bản sửa nào. Bản đầu tiên được tạo khi bạn bấm “Lưu”.</p>}
          {revisions && revisions.length > 0 && (
            <ol>
              {revisions.map((r) => (
                <li key={r.revisionNo} className="flex items-center gap-2 rounded-md px-3 py-2.5 hover:bg-secondary">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-label font-medium">
                      {formatTime(r.createdAt)} · {formatDate(r.createdAt)}
                    </span>
                    <span className="truncate text-small text-muted-foreground">
                      {formatNumber(r.wordCount)} chữ · {r.editedBy.penName}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onView(r)} aria-label={`Xem bản lúc ${formatTime(r.createdAt)} ${formatDate(r.createdAt)}`}>
                    Xem
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onRestore(r)} aria-label={`Khôi phục bản lúc ${formatTime(r.createdAt)} ${formatDate(r.createdAt)}`}>
                    Khôi phục
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RevisionPreviewDialogProps {
  revision: Revision | null;
  /** R2 is loading */
  loading?: boolean;
  onClose: () => void;
  onRestore: (r: Revision) => void;
}

/** Read-only view of one revision (R2) with "Khôi phục bản này". */
export function RevisionPreviewDialog({ revision, loading, onClose, onRestore }: RevisionPreviewDialogProps) {
  const html = useMemo(() => sanitizeHtml(revision?.content ?? ''), [revision?.content]);
  return (
    <Dialog open={revision !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-32px)] max-w-[760px] flex-col gap-4 sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-title-3">{revision?.title ?? 'Bản sửa'}</DialogTitle>
          <DialogDescription>
            {revision && `Bản lúc ${formatTime(revision.createdAt)} ${formatDate(revision.createdAt)} · ${formatNumber(revision.wordCount)} chữ · ${revision.editedBy.penName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-card px-6 py-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-4 bg-secondary" />
              ))}
            </div>
          ) : (
            <div className="reader" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={() => revision && onRestore(revision)} disabled={loading || !revision}>
            Khôi phục bản này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
