/** Geometry of the chapter body in page coordinates (px). */
export interface ContentBox {
  /** document Y of the content's top edge */
  top: number;
  height: number;
  /** window.innerHeight */
  viewport: number;
}

function clampPercent(n: number) {
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

/**
 * How far the reader is through the chapter body, 0–100 with 2 decimals (the precision of the backend).
 * 0 = the top of the text at the top of the window, 100 = the end of the text at the bottom of the window.
 * Space above the text (toolbar, first-chapter splash) counts as 0. A body shorter than the window is 100
 * once its end is visible.
 */
export function scrollPercentOf(scrollY: number, box: ContentBox): number {
  const range = box.height - box.viewport;
  if (range <= 0) return scrollY + box.viewport >= box.top + box.height ? 100 : 0;
  return clampPercent(((scrollY - box.top) / range) * 100);
}

/** Inverse of scrollPercentOf: the window scroll Y that shows `percent` of the body. */
export function scrollYFor(percent: number, box: ContentBox): number {
  const range = Math.max(0, box.height - box.viewport);
  return Math.max(0, Math.round(box.top + (clampPercent(percent) / 100) * range));
}

/** A new position is worth saving when it moved at least 1 point, or reached the end. */
export function shouldSaveProgress(last: number | null, next: number): boolean {
  if (last === null) return true;
  if (next === 100 && last !== 100) return true;
  return Math.abs(next - last) >= 1;
}
