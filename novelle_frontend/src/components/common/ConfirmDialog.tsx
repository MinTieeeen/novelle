import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** extra content between the text and the buttons (e.g. a note field) */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  /** irreversible actions (delete) use the destructive button */
  destructive?: boolean;
  pending?: boolean;
  /** the dialog stays open while the action runs; the caller closes it on success */
  onConfirm: () => void;
}

/**
 * Confirmation before an irreversible or important action (board ConfirmDialog): title as a question,
 * one sentence on what happens, cancel + confirm. Esc / cancel close it unless the action is running.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Huỷ',
  destructive,
  pending,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent className="max-w-[440px] gap-5 p-6 sm:max-w-[440px]">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="font-serif text-title-3">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-body text-muted-foreground">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={pending} onClick={onConfirm}>
            {pending && <Loader2 className="animate-spin" strokeWidth={1.75} aria-hidden />}
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
