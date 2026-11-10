import { describe, expect, it } from 'vitest';
import { safeRedirect } from '@/utils/redirect';

describe('safeRedirect', () => {
  it.each([
    ['/library?tab=lists', '/library?tab=lists'],
    ['/studio', '/studio'],
    [null, '/'],
    ['', '/'],
    ['library', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\tjavascript:alert(1)', '/'],
    ['/login?redirect=/x', '/'],
    ['/register', '/'],
  ])('%j → %j', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
