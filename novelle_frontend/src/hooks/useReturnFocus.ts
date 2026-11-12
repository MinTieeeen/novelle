import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Dialogs opened from state (no Radix Trigger) do not know where focus should go when they close.
 * Remembers the focused element when `open` turns true; pass `onCloseAutoFocus` to the dialog content to
 * move focus back to it (without scrolling) when it closes. Falls back to Radix' default when that element
 * is gone (e.g. the card was deleted).
 */
export function useReturnFocus(open: boolean) {
  const target = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) target.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  return useCallback((event: Event) => {
    const el = target.current;
    if (el?.isConnected) {
      event.preventDefault();
      el.focus({ preventScroll: true });
    }
  }, []);
}
