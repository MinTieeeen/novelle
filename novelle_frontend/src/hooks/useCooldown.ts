import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds left before an action may run again (RATE_LIMITED → details.retryAfterSeconds).
 * `start(n)` begins a countdown; `remaining` is 0 when the action is allowed.
 */
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [until, now]);

  const start = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  }, []);

  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  return { remaining, start };
}
