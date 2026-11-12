import { describe, expect, it } from 'vitest';
import { authorRequestSchema, rejectSchema, requestCode, REQUEST_MSG } from './authorRequest';
import { LIBRARY_MSG, moveItem, orderOf, readingListSchema } from './library';
import { distributionRows, ratingSchema, RATING_MSG } from './rating';

const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe('readingListSchema', () => {
  it('trims and accepts 1–100 characters', () => {
    const r = readingListSchema.safeParse({ name: '  Đọc đêm mưa ', description: '', isPublic: false });
    expect(r.success && r.data.name).toBe('Đọc đêm mưa');
    expect(readingListSchema.safeParse({ name: 'a'.repeat(100), description: '', isPublic: true }).success).toBe(true);
  });

  it('rejects a blank or too long name and a long description', () => {
    expect(firstError(readingListSchema.safeParse({ name: '   ', description: '', isPublic: true }))).toBe(LIBRARY_MSG.listName);
    expect(firstError(readingListSchema.safeParse({ name: 'a'.repeat(101), description: '', isPublic: true }))).toBe(LIBRARY_MSG.listName);
    expect(firstError(readingListSchema.safeParse({ name: 'Tủ', description: 'x'.repeat(501), isPublic: true }))).toBe(
      LIBRARY_MSG.listDescription,
    );
  });
});

describe('moveItem / orderOf', () => {
  it('moves an item down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('lists each story id once, in order', () => {
    const s = (storyId: number) => ({ story: { storyId } as never });
    expect(orderOf([s(3), s(1), s(3), s(2)])).toEqual([3, 1, 2]);
  });
});

describe('ratingSchema / distributionRows', () => {
  it('accepts 1–5 and trims the review', () => {
    const r = ratingSchema.safeParse({ score: 4, review: '  hay ' });
    expect(r.success && r.data.review).toBe('hay');
  });

  it('rejects 0, 6 and a missing score', () => {
    expect(firstError(ratingSchema.safeParse({ score: 0, review: '' }))).toBe(RATING_MSG.score);
    expect(firstError(ratingSchema.safeParse({ score: 6, review: '' }))).toBe(RATING_MSG.score);
    expect(firstError(ratingSchema.safeParse({ review: '' }))).toBe(RATING_MSG.score);
  });

  it('rejects a review over 1000 characters', () => {
    expect(firstError(ratingSchema.safeParse({ score: 3, review: 'x'.repeat(1001) }))).toBe(RATING_MSG.review);
  });

  it('builds the bars 5 → 1 with whole percents', () => {
    const rows = distributionRows({ ratingCount: 8, distribution: { '1': 0, '2': 1, '3': 1, '4': 2, '5': 4 } });
    expect(rows.map((r) => r.star)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((r) => r.percent)).toEqual([50, 25, 13, 13, 0]);
  });

  it('is all zero without ratings', () => {
    const rows = distributionRows({ ratingCount: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } });
    expect(rows.every((r) => r.percent === 0)).toBe(true);
  });
});

describe('authorRequestSchema', () => {
  const valid = { proposedPenName: 'Hoài Thu', introduction: 'Tôi viết truyện ngắn về sông nước.', agree: true as const };

  it('accepts the limits after trimming', () => {
    expect(authorRequestSchema.safeParse({ ...valid, proposedPenName: ' ab ' }).success).toBe(true);
    expect(authorRequestSchema.safeParse({ ...valid, proposedPenName: 'a'.repeat(100) }).success).toBe(true);
    expect(authorRequestSchema.safeParse({ ...valid, introduction: 'x'.repeat(2000) }).success).toBe(true);
  });

  it('counts the minimum after trimming', () => {
    expect(firstError(authorRequestSchema.safeParse({ ...valid, proposedPenName: ' a ' }))).toBe(REQUEST_MSG.penName);
    expect(firstError(authorRequestSchema.safeParse({ ...valid, introduction: `  ${'x'.repeat(19)}   ` }))).toBe(REQUEST_MSG.intro);
  });

  it('rejects too long fields and a missing commitment', () => {
    expect(firstError(authorRequestSchema.safeParse({ ...valid, proposedPenName: 'a'.repeat(101) }))).toBe(REQUEST_MSG.penName);
    expect(firstError(authorRequestSchema.safeParse({ ...valid, introduction: 'x'.repeat(2001) }))).toBe(REQUEST_MSG.intro);
    expect(firstError(authorRequestSchema.safeParse({ ...valid, agree: false }))).toBe(REQUEST_MSG.agree);
  });

  it('limits the reject note to 500 characters', () => {
    expect(rejectSchema.safeParse({ note: '' }).success).toBe(true);
    expect(firstError(rejectSchema.safeParse({ note: 'x'.repeat(501) }))).toBe(REQUEST_MSG.note);
  });

  it('formats the request code', () => {
    expect(requestCode(142)).toBe('AR-0142');
    expect(requestCode(12345)).toBe('AR-12345');
  });
});
