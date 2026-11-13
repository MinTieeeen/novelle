import { cn } from '@/lib/utils';

interface LogoProps {
  /** wordmark = "novelle" (main logo), mark = the N tile (icons, sidebars, favicon) */
  variant?: 'wordmark' | 'mark';
  className?: string;
  /** Empty when the logo sits next to visible text that already names the link. */
  alt?: string;
}

/**
 * Novelle logo (light theme files, fixed colours). Never recolour, rotate, stretch or put a shadow on it.
 * Heights: header 30px, sidebar 26–28px, login 48–72px.
 */
export function Logo({ variant = 'wordmark', className, alt = 'Novelle' }: LogoProps) {
  const size = variant === 'wordmark' ? 'h-[30px] w-auto' : 'h-7 w-auto';
  return <img src={`/brand/novelle-${variant}.svg`} alt={alt} className={cn(size, 'block', className)} />;
}
