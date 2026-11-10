import { cn } from '@/lib/utils';

interface LogoProps {
  /** wordmark = "novelle" (main logo), mark = the N tile (icons, sidebars, favicon) */
  variant?: 'wordmark' | 'mark';
  className?: string;
  /** Empty when the logo sits next to visible text that already names the link. */
  alt?: string;
}

/**
 * Novelle logo. The SVGs have fixed colours, so both theme versions are rendered and CSS shows the
 * one matching `.dark`. Never recolour, rotate, stretch or put a shadow on it.
 * Heights: header 30px, sidebar 26–28px, login 48–72px.
 */
export function Logo({ variant = 'wordmark', className, alt = 'Novelle' }: LogoProps) {
  const base = `/brand/novelle-${variant}`;
  const size = variant === 'wordmark' ? 'h-[30px] w-auto' : 'h-7 w-auto';
  return (
    <>
      <img src={`${base}.svg`} alt={alt} className={cn(size, 'block dark:hidden', className)} />
      <img src={`${base}-dark.svg`} alt={alt} className={cn(size, 'hidden dark:block', className)} />
    </>
  );
}
