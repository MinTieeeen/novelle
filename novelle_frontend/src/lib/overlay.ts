/**
 * Sonner renders toasts outside the open Dialog/Sheet, so Radix treats clicking a toast (or its close
 * button) as an "interaction outside" and closes the dialog. Wrap the content's onInteractOutside with
 * this so toasts never close the dialog under them.
 */
export function keepOpenOnToast<E extends { target: EventTarget | null; preventDefault(): void }>(
  handler?: (event: E) => void,
) {
  return (event: E) => {
    const target = event.target as Element | null;
    if (target?.closest?.('[data-sonner-toaster]')) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };
}
