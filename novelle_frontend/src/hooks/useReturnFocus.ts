import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * The focused element, or — when it is an item of a dropdown menu that is about to unmount (dialog opened
 * from a ⋯ menu) — the button that opened that menu (Radix links them with aria-controls).
 */
function opener(): HTMLElement | null {
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const menu = el?.closest<HTMLElement>('[role="menu"]');
  if (menu?.id) return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? el;
  return el;
}

/**
 * Dialogs opened from state (no Radix Trigger) do not know where focus should go when they close.
 * Remembers the focused element when `open` turns true; pass `onCloseAutoFocus` to the dialog content to
 * move focus back to it (without scrolling) when it closes. Falls back to Radix' default when that element
 * is gone (e.g. the card was deleted).
 */
export function useReturnFocus(open: boolean) {
  const target = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) target.current = opener();
  }, [open]);

  return useCallback((event: Event) => {
    const el = target.current;
    if (el?.isConnected) {
      event.preventDefault();
      el.focus({ preventScroll: true });
    }
  }, []);
}
