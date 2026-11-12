import { describe, expect, it } from 'vitest';
import { scrollPercentOf, scrollYFor, shouldSaveProgress } from './reading';

const box = { top: 100, height: 3100, viewport: 1000 };

describe('scrollPercentOf', () => {
  it('is 0 above and at the top of the text', () => {
    expect(scrollPercentOf(0, box)).toBe(0);
    expect(scrollPercentOf(100, box)).toBe(0);
  });

  it('is linear through the text, 2 decimals', () => {
    expect(scrollPercentOf(1150, box)).toBe(50);
    expect(scrollPercentOf(101, box)).toBe(0.05);
  });

  it('is 100 at and past the end', () => {
    expect(scrollPercentOf(2200, box)).toBe(100);
    expect(scrollPercentOf(9999, box)).toBe(100);
  });

  it('handles a body shorter than the window', () => {
    const short = { top: 100, height: 400, viewport: 1000 };
    expect(scrollPercentOf(0, short)).toBe(100);
    expect(scrollPercentOf(0, { ...short, top: 900 })).toBe(0);
  });
});

describe('scrollYFor', () => {
  it('inverts scrollPercentOf', () => {
    expect(scrollYFor(0, box)).toBe(100);
    expect(scrollYFor(50, box)).toBe(1150);
    expect(scrollPercentOf(scrollYFor(37.25, box), box)).toBeCloseTo(37.25, 1);
  });

  it('clamps out-of-range percents', () => {
    expect(scrollYFor(150, box)).toBe(2200);
    expect(scrollYFor(-5, box)).toBe(100);
  });
});

describe('shouldSaveProgress', () => {
  it('saves the first position', () => expect(shouldSaveProgress(null, 0)).toBe(true));
  it('skips moves under 1 point', () => expect(shouldSaveProgress(10, 10.9)).toBe(false));
  it('saves moves of 1 point or more', () => expect(shouldSaveProgress(10, 9)).toBe(true));
  it('always saves reaching the end', () => expect(shouldSaveProgress(99.5, 100)).toBe(true));
  it('does not resave the end', () => expect(shouldSaveProgress(100, 100)).toBe(false));
});
