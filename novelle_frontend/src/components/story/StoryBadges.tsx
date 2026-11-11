import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, type AgeRating, type CompletionStatus } from '@/types/story';

const STATUS_VARIANT = { ONGOING: 'default', COMPLETED: 'success', HIATUS: 'warning' } as const;

/** Completion status (DS Badge table): Đang ra → default, Hoàn thành → success, Tạm ngưng → warning. */
export function StatusBadge({ status }: { status: CompletionStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Age rating: 18+ → age (critical outline), 13+ → outline, ALL → nothing. */
export function AgeBadge({ ageRating }: { ageRating: AgeRating }) {
  if (ageRating === 'ALL') return null;
  return <Badge variant={ageRating === '18+' ? 'age' : 'outline'}>{ageRating}</Badge>;
}

/** Genre label (cham-soft), e.g. the primary genre in a result row. */
export function GenreBadge({ name }: { name: string }) {
  return <Badge>{name}</Badge>;
}
