import { Loader2 } from 'lucide-react';

/** Shown while /api/me is pending so guarded routes never flash. */
export function FullPageSpinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[60vh] place-items-center text-muted-foreground">
      <span className="inline-flex items-center gap-2 text-small">
        <Loader2 className="size-5 animate-spin text-primary" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
    </div>
  );
}
