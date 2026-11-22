import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Says plainly what is empty: "Bạn chưa theo dõi truyện nào" */
  title: ReactNode;
  /** Suggests what to do next */
  description?: ReactNode;
  /** Usually one primary button: "Khám phá truyện" */
  action?: ReactNode;
  className?: string;
}

/** Empty state = an invitation to act: grey ribbon, one sentence, one hint, one primary button. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex max-w-[520px] flex-col items-start gap-3 rounded-lg border border-dashed border-input p-8',
        className,
      )}
    >
      <span aria-hidden className="ribbon-shape h-10 w-3.5 bg-input" />
      <h3 className="text-title-3 font-semibold">{title}</h3>
      {description && <p className="text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
