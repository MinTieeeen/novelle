import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The design system adds named font sizes (text-body, text-title-2, ...) in globals.css. tailwind-merge
 * must know they are sizes; otherwise `cn('text-body', 'text-foreground')` would drop one of them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'title-1',
        'title-2',
        'title-3',
        'chapter-title',
        'reading',
        'body',
        'label',
        'small',
        'caption',
      ],
      shadow: ['raise', 'cover', 'overlay'],
      radius: ['cover'],
    },
  },
});

/** Merges class names; later Tailwind classes win over earlier ones. Used by every shadcn component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
