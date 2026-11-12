import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftSaveResult } from '@/types/studio';
import { hasCode } from '@/utils/errors';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** VITE_AUTOSAVE_INTERVAL_MS (10 s by default). */
export const AUTOSAVE_INTERVAL_MS = Number(import.meta.env.VITE_AUTOSAVE_INTERVAL_MS) || 10_000;

interface Options {
  /** increases on every edit; an autosave runs only when it changed since the last one */
  changeId: number;
  /** C4 with the current title and content */
  save: () => Promise<DraftSaveResult>;
  /** off while the chapter is not loaded yet, or while "Lưu" / "Xuất bản" runs */
  paused?: boolean;
  intervalMs?: number;
}

/**
 * Autosave of the chapter editor (module-studio §10): every `intervalMs`, if something changed since the
 * last autosave and nothing else is saving, sends one draft (C4). A hidden tab sends right away.
 * RATE_LIMITED skips this round (the next one retries); `saved: false` (Redis down) or another error
 * shows "Chưa lưu được bản nháp" without blocking the editor.
 */
export function useAutosave({ changeId, save, paused = false, intervalMs = AUTOSAVE_INTERVAL_MS }: Options) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saving = useRef(false);
  const lastSaved = useRef(changeId);
  const latest = useRef({ changeId, save, paused });
  latest.current = { changeId, save, paused };

  const run = useCallback(async () => {
    const { changeId: id, save: doSave, paused: isPaused } = latest.current;
    if (isPaused || saving.current || id === lastSaved.current) return;
    saving.current = true;
    setStatus('saving');
    try {
      const res = await doSave();
      lastSaved.current = id;
      if (res.saved) {
        setStatus('saved');
        setSavedAt(res.savedAt ?? new Date().toISOString());
      } else {
        setStatus('failed');
      }
    } catch (e) {
      // Rate limited: keep the last state, the next round sends again (lastSaved unchanged).
      setStatus(hasCode(e, 'RATE_LIMITED') ? (s) => (s === 'saving' ? 'idle' : s) : 'failed');
    } finally {
      saving.current = false;
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void run(), intervalMs);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void run();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [run, intervalMs]);

  /**
   * After "Lưu" (C6) the saved chapter is newer than any draft: count the current state as autosaved so
   * the next round does not send an old copy.
   */
  const markSaved = useCallback(() => {
    lastSaved.current = latest.current.changeId;
    setStatus('idle');
  }, []);

  return { status, savedAt, flush: run, markSaved };
}
