import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether the reader toolbar should hide: true after scrolling down `threshold` px past `offset`, false
 * again on any scroll up of `threshold` px or near the top. One passive listener, read in rAF.
 * Call `reveal()` after a programmatic jump (restoring the reading position) so it does not count as
 * scrolling down.
 */
export function useHideOnScroll({ threshold = 8, offset = 64 }: { threshold?: number; offset?: number } = {}) {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    last.current = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (y <= offset) setHidden(false);
        else if (y - last.current > threshold) setHidden(true);
        else if (last.current - y > threshold) setHidden(false);
        if (Math.abs(y - last.current) > threshold) last.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold, offset]);

  const reveal = useCallback(() => {
    last.current = window.scrollY;
    setHidden(false);
  }, []);

  return { hidden, reveal };
}
