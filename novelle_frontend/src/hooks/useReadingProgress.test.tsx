import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/http';
import { saveProgress, saveProgressOnLeave } from '@/api/reading';
import { PROGRESS_DEBOUNCE_MS, useReadingProgress } from './useReadingProgress';

vi.mock('@/api/reading', () => ({ saveProgress: vi.fn(), saveProgressOnLeave: vi.fn() }));

const save = vi.mocked(saveProgress);
const saveOnLeave = vi.mocked(saveProgressOnLeave);

// Body: top 0, height 3000, window 1000 → percent = scrollY / 20.
const el = { getBoundingClientRect: () => ({ top: -window.scrollY, height: 3000 }) } as unknown as HTMLElement;
const contentRef = { current: el };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20); // rAF
  });
}

function render(props: Partial<Parameters<typeof useReadingProgress>[0]> = {}) {
  return renderHook((p) => useReadingProgress(p), {
    wrapper,
    initialProps: { storyId: 7, chapterId: 70, contentRef, save: true, initialPercent: null, ...props },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.scrollY = 0;
  window.innerHeight = 1000;
  save.mockReset().mockResolvedValue({} as never);
  saveOnLeave.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useReadingProgress', () => {
  it('measures the percentage through the body', () => {
    const { result } = render();
    scrollTo(1000);
    expect(result.current).toBe(50);
  });

  it('saves once after the debounce, with the latest position', () => {
    render({ initialPercent: 0 });
    scrollTo(400);
    scrollTo(600);
    act(() => vi.advanceTimersByTime(PROGRESS_DEBOUNCE_MS - 100));
    expect(save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(7, { chapterId: 70, scrollPercent: 30 });
  });

  it('skips moves under 1 point from the saved position', () => {
    render({ initialPercent: 30 });
    scrollTo(610); // 30.5
    act(() => vi.advanceTimersByTime(PROGRESS_DEBOUNCE_MS * 2));
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save for a guest', () => {
    render({ save: false });
    scrollTo(1000);
    act(() => vi.advanceTimersByTime(PROGRESS_DEBOUNCE_MS * 2));
    expect(save).not.toHaveBeenCalled();
  });

  it('stops saving after 401', async () => {
    save.mockRejectedValue(new ApiError({ status: 401, code: 'UNAUTHENTICATED', message: '' }));
    render({ initialPercent: 0 });
    scrollTo(400);
    await act(async () => vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS));
    scrollTo(1400);
    await act(async () => vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('retries on the next scroll after 429', async () => {
    save.mockRejectedValueOnce(new ApiError({ status: 429, code: 'RATE_LIMITED', message: '' }));
    render({ initialPercent: 0 });
    scrollTo(400);
    await act(async () => vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS));
    scrollTo(420);
    await act(async () => vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('sends a keepalive save when the page is hidden', () => {
    render({ initialPercent: 0 });
    scrollTo(800);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(saveOnLeave).toHaveBeenCalledWith(7, { chapterId: 70, scrollPercent: 40 });
  });

  it('flushes the unsaved position when the chapter changes', () => {
    const { rerender } = render({ initialPercent: 0 });
    scrollTo(800);
    rerender({ storyId: 7, chapterId: 71, contentRef, save: true, initialPercent: null });
    expect(save).toHaveBeenCalledWith(7, { chapterId: 70, scrollPercent: 40 });
  });
});
