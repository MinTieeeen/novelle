import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/http';
import { useAutosave } from './useAutosave';

const INTERVAL = 10_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save = vi.fn().mockResolvedValue({ saved: true, savedAt: '2026-11-12T07:32:00Z' })) {
  const hook = renderHook((p: { changeId: number; paused?: boolean }) => useAutosave({ ...p, save, intervalMs: INTERVAL }), {
    initialProps: { changeId: 0 } as { changeId: number; paused?: boolean },
  });
  return { ...hook, save };
}

const tick = () => act(async () => vi.advanceTimersByTimeAsync(INTERVAL));

describe('useAutosave', () => {
  it('does nothing while nothing changed', async () => {
    const { save } = setup();
    await tick();
    await tick();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves once per round after a change, then waits for the next change', async () => {
    const { rerender, save, result } = setup();
    rerender({ changeId: 1 });
    rerender({ changeId: 2 });
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');
    expect(result.current.savedAt).toBe('2026-11-12T07:32:00Z');
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
    rerender({ changeId: 3 });
    await tick();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('waits while paused', async () => {
    const { rerender, save } = setup();
    rerender({ changeId: 1, paused: true });
    await tick();
    expect(save).not.toHaveBeenCalled();
    rerender({ changeId: 1, paused: false });
    await tick();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('retries the next round after RATE_LIMITED', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 429, code: 'RATE_LIMITED', message: '' }))
      .mockResolvedValue({ saved: true, savedAt: '2026-11-12T07:33:00Z' });
    const { rerender, result } = setup(save);
    rerender({ changeId: 1 });
    await tick();
    expect(result.current.status).toBe('idle');
    await tick();
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('reports a draft Redis did not keep', async () => {
    const { rerender, result } = setup(vi.fn().mockResolvedValue({ saved: false }));
    rerender({ changeId: 1 });
    await tick();
    expect(result.current.status).toBe('failed');
  });

  it('sends right away when the tab is hidden', async () => {
    const { rerender, save } = setup();
    rerender({ changeId: 1 });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('skips the current state after markSaved (saved with "Lưu")', async () => {
    const { rerender, save, result } = setup();
    rerender({ changeId: 4 });
    act(() => result.current.markSaved());
    await tick();
    expect(save).not.toHaveBeenCalled();
  });
});
