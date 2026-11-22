import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Reader-site content column: 1200px (content-max) plus a 16/24px side gutter. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto box-content max-w-content px-4 sm:px-6', className)} {...props} />;
}
