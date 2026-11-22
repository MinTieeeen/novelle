import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Asks before leaving while `when` is true (chapter editor with changes not saved by "Lưu"): in-app
 * navigation is held by the data router's blocker (render a ConfirmDialog from `blocker.state ===
 * 'blocked'`, then `proceed()` / `reset()`); closing or reloading the tab gets the browser's own prompt.
 */
export function useUnsavedChanges(when: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still need returnValue to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  return blocker;
}
