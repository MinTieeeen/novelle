import { describe, expect, it } from 'vitest';
import {
  ADMIN_MSG,
  avgChapters,
  composeReason,
  createAdminSchema,
  genreSchema,
  parseStoryFilters,
  parseUserFilters,
  perStory,
  reasonSchema,
  tagNameSchema,
  toStoryParams,
  toUserParams,
  vsAverage,
} from './admin';

const issue = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) => r.error?.issues[0];

describe('reasons', () => {
  it('composes chip and note', () => {
    expect(composeReason('Spam', '')).toBe('Spam');
    expect(composeReason('Spam', '  quảng   cáo ')).toBe('Spam: quảng cáo');
    expect(composeReason('Khác', ' tự ghi ')).toBe('tự ghi');
  });

  it('needs a chip, a note for "Khác", and ≤ 500 characters', () => {
    expect(issue(reasonSchema.safeParse({ chip: '', note: '' }))?.message).toBe(ADMIN_MSG.reasonChip);
    expect(issue(reasonSchema.safeParse({ chip: 'Khác', note: '  ' }))?.message).toBe(ADMIN_MSG.reasonNote);
    expect(reasonSchema.safeParse({ chip: 'Spam', note: 'x'.repeat(494) }).success).toBe(true);
    expect(issue(reasonSchema.safeParse({ chip: 'Spam', note: 'x'.repeat(495) }))?.message).toBe(ADMIN_MSG.reasonTooLong);
  });
});

describe('forms', () => {
  it('create admin uses the registration rules', () => {
    const ok = { displayName: 'Quản trị', username: 'admin_2', email: 'a@novelle.vn', password: '12345678' };
    expect(createAdminSchema.safeParse(ok).success).toBe(true);
    expect(issue(createAdminSchema.safeParse({ ...ok, username: 'Admin' }))?.path).toEqual(['username']);
    expect(issue(createAdminSchema.safeParse({ ...ok, password: 'short' }))?.path).toEqual(['password']);
    expect(issue(createAdminSchema.safeParse({ ...ok, email: 'x' }))?.path).toEqual(['email']);
  });

  it('genre: name 1–50 with a letter, description ≤ 500, order 0–32000', () => {
    const ok = { name: 'Huyền huyễn', description: '', sortOrder: 3 };
    expect(genreSchema.safeParse(ok).success).toBe(true);
    expect(issue(genreSchema.safeParse({ ...ok, name: '---' }))?.message).toBe(ADMIN_MSG.genreName);
    expect(issue(genreSchema.safeParse({ ...ok, name: 'x'.repeat(51) }))?.message).toBe(ADMIN_MSG.genreName);
    expect(issue(genreSchema.safeParse({ ...ok, sortOrder: 32_001 }))?.message).toBe(ADMIN_MSG.sortOrder);
    expect(issue(genreSchema.safeParse({ ...ok, description: 'x'.repeat(501) }))?.message).toBe(ADMIN_MSG.genreDescription);
  });

  it('tag name normalised, 2–50', () => {
    const r = tagNameSchema.safeParse('  trùng   sinh ');
    expect(r.success && r.data).toBe('trùng sinh');
    expect(tagNameSchema.safeParse('a').success).toBe(false);
    expect(tagNameSchema.safeParse('--').success).toBe(false);
  });
});

describe('filters on the URL', () => {
  it('parses and drops invalid values', () => {
    const f = parseUserFilters(new URLSearchParams('q= lan &role=AUTHOR&status=X&from=2026-02-01&to=2026-01-01&page=2'));
    expect(f).toEqual({ q: 'lan', role: 'AUTHOR', status: undefined, from: '2026-02-01', to: undefined, page: 2 });
    expect(parseStoryFilters(new URLSearchParams('status=HIDDEN&authorId=abc'))).toEqual({ q: '', status: 'HIDDEN', authorId: undefined, page: 0 });
  });

  it('serialises back, keeping the open sheet', () => {
    expect(toUserParams({ q: 'lan', role: 'READER', page: 0 }, { user: '12' }).toString()).toBe('q=lan&role=READER&user=12');
    expect(toStoryParams({ q: '', authorId: 17, page: 3 }).toString()).toBe('authorId=17&page=3');
  });
});

describe('dashboard helpers', () => {
  it('views per story and ratio to the average', () => {
    expect(perStory(150_000, 5)).toBe(30_000);
    expect(perStory(10, 0)).toBe(0);
    expect(vsAverage(30_000, 6_533)).toBe(4.6);
    expect(vsAverage(1, 0)).toBeNull();
    expect(avgChapters(84_220, 1_906)).toBe(44.2);
  });
});
