import { useEffect, useRef, useState } from 'react';
import { useDebounce } from './useDebounce';

/**
 * A search box bound to a committed value (usually on the URL): typing commits after `delayMs`
 * (debounce), Enter commits at once, and a change from outside (Back, a link) refills the box.
 */
export function useSearchBox(committed: string, commit: (q: string) => void, delayMs = 300) {
  const [text, setText] = useState(committed);
  const [seen, setSeen] = useState(committed);
  // URL changed from outside: show it (unless it is just the trimmed text being typed)
  if (committed !== seen) {
    setSeen(committed);
    if (committed !== text.trim()) setText(committed);
  }
  const debounced = useDebounce(text, delayMs);
  const latest = useRef({ committed, commit });
  useEffect(() => {
    latest.current = { committed, commit };
  });
  useEffect(() => {
    const v = debounced.trim();
    if (v !== latest.current.committed) latest.current.commit(v);
  }, [debounced]);

  const flush = () => {
    const v = text.trim();
    if (v !== committed) commit(v);
  };
  return { text, setText, flush };
}
