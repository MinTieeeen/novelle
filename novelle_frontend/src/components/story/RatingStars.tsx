import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatRating } from '@/utils/format';

interface RatingStarsProps {
  value: number;
  count?: number;
  /** one star + number (cards, rows) or five stars (filters, rating section) */
  variant?: 'compact' | 'stars';
  className?: string;
}

/**
 * Rating in nghe (DS Rating). nghe is only 2:1 on light surfaces, so the number is always shown:
 * "4,6 (312)". A story nobody rated shows "Chưa có đánh giá".
 */
export function RatingStars({ value, count, variant = 'compact', className }: RatingStarsProps) {
  const label = count === 0 ? 'Chưa có đánh giá' : `${formatRating(value)} sao${count != null ? `, ${formatNumber(count)} lượt đánh giá` : ''}`;

  if (variant === 'stars') {
    return (
      <span role="img" aria-label={label} className={cn('inline-flex gap-1', className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            aria-hidden
            strokeWidth={1.75}
            className={cn('size-4', i <= Math.round(value) ? 'fill-nghe text-nghe' : 'text-input')}
          />
        ))}
      </span>
    );
  }

  if (count === 0) return <span className={cn('text-muted-foreground', className)}>Chưa có đánh giá</span>;

  return (
    <span aria-label={label} className={cn('inline-flex items-center gap-1', className)}>
      <Star aria-hidden strokeWidth={1.75} className="size-3.5 fill-nghe text-nghe" />
      <span className="num font-medium text-foreground">{formatRating(value)}</span>
      {count != null && <span className="num text-muted-foreground">({formatNumber(count)})</span>}
    </span>
  );
}
