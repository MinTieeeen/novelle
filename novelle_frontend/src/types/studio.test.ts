import { describe, expect, it } from 'vitest';
import {
  addTag,
  authorProfileSchema,
  coverUrls,
  nextChapterTitle,
  pctChange,
  rangeQueries,
  scheduleError,
  storySchema,
  STUDIO_MSG,
  summarizeChapters,
  tagSlug,
  textLength,
  volumeSchema,
} from './studio';

const firstError = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) => r.error?.issues[0];

const valid = {
  title: 'Người Gác Đèn',
  description: '',
  coverUrl: '',
  ageRating: 'ALL' as const,
  completionStatus: 'ONGOING' as const,
  genreIds: [2, 7],
  primaryGenreId: 2,
  tags: ['Huế'],
};

describe('storySchema', () => {
  it('accepts a valid story and trims', () => {
    const r = storySchema.safeParse({ ...valid, title: '  Bến Vân Lâu ', tags: ['  hệ   thống '] });
    expect(r.success && r.data.title).toBe('Bến Vân Lâu');
    expect(r.success && r.data.tags).toEqual(['hệ thống']);
  });

  it('checks the title and description limits', () => {
    expect(storySchema.safeParse({ ...valid, title: 'a'.repeat(300) }).success).toBe(true);
    expect(firstError(storySchema.safeParse({ ...valid, title: 'a'.repeat(301) }))?.message).toBe(STUDIO_MSG.storyTitle);
    expect(firstError(storySchema.safeParse({ ...valid, title: '   ' }))?.message).toBe(STUDIO_MSG.storyTitle);
    expect(firstError(storySchema.safeParse({ ...valid, description: 'x'.repeat(4001) }))?.message).toBe(STUDIO_MSG.description);
  });

  it('needs 1–3 genres with the primary one among them', () => {
    expect(firstError(storySchema.safeParse({ ...valid, genreIds: [] }))?.message).toBe(STUDIO_MSG.genres);
    expect(firstError(storySchema.safeParse({ ...valid, genreIds: [1, 2, 3, 4] }))?.message).toBe(STUDIO_MSG.genres);
    const r = firstError(storySchema.safeParse({ ...valid, primaryGenreId: 9 }));
    expect(r?.path).toEqual(['primaryGenreId']);
  });

  it('limits tags to 10 of 2–50 characters with a letter or digit', () => {
    expect(storySchema.safeParse({ ...valid, tags: Array.from({ length: 10 }, (_, i) => `tag ${i}`) }).success).toBe(true);
    expect(firstError(storySchema.safeParse({ ...valid, tags: Array.from({ length: 11 }, (_, i) => `tag ${i}`) }))?.message).toBe(STUDIO_MSG.tags);
    expect(firstError(storySchema.safeParse({ ...valid, tags: ['a'] }))?.message).toBe(STUDIO_MSG.tags);
    expect(firstError(storySchema.safeParse({ ...valid, tags: ['--'] }))?.message).toBe(STUDIO_MSG.tags);
  });

  it('accepts only the provided covers or none', () => {
    expect(storySchema.safeParse({ ...valid, coverUrl: '/covers/kinh-di/03.jpg' }).success).toBe(true);
    expect(storySchema.safeParse({ ...valid, coverUrl: 'https://x.com/a.jpg' }).success).toBe(false);
  });
});

describe('tags', () => {
  it('slugs Vietnamese names', () => {
    expect(tagSlug('Hệ Thống')).toBe('he-thong');
    expect(tagSlug('Đô thị')).toBe('do-thi');
  });

  it('adds a tag once by slug, ignores invalid ones', () => {
    expect(addTag(['Hệ thống'], 'he  thong')).toEqual(['Hệ thống']);
    expect(addTag(['Huế'], ' tâm linh ')).toEqual(['Huế', 'tâm linh']);
    expect(addTag([], 'a')).toEqual([]);
  });
});

describe('other schemas', () => {
  it('volume title 1–200', () => {
    expect(volumeSchema.safeParse({ title: 'Mùa nước lên' }).success).toBe(true);
    expect(firstError(volumeSchema.safeParse({ title: 'x'.repeat(201) }))?.message).toBe(STUDIO_MSG.volumeTitle);
  });

  it('pen name 2–100 after trim, bio ≤ 2000', () => {
    expect(firstError(authorProfileSchema.safeParse({ penName: ' a ', bio: '' }))?.message).toBe(STUDIO_MSG.penName);
    expect(authorProfileSchema.safeParse({ penName: 'Mộc Lan', bio: 'x'.repeat(2000) }).success).toBe(true);
    expect(firstError(authorProfileSchema.safeParse({ penName: 'Mộc Lan', bio: 'x'.repeat(2001) }))?.message).toBe(STUDIO_MSG.bio);
  });
});

describe('scheduleError', () => {
  const now = new Date('2026-11-12T03:00:00Z');
  it('needs at least one minute ahead and at most 365 days', () => {
    expect(scheduleError('2026-11-12T03:00:30Z', now)).toBe(STUDIO_MSG.scheduleTooSoon);
    expect(scheduleError('2026-11-12T03:01:00Z', now)).toBeNull();
    expect(scheduleError('2027-11-13T03:00:00Z', now)).toBe(STUDIO_MSG.scheduleTooFar);
    expect(scheduleError('not a date', now)).toBe(STUDIO_MSG.scheduleTooSoon);
  });
});

describe('helpers', () => {
  it('lists the 8 covers of a genre', () => {
    const urls = coverUrls('kinh-di');
    expect(urls).toHaveLength(8);
    expect(urls[0]).toBe('/covers/kinh-di/01.jpg');
    expect(urls[7]).toBe('/covers/kinh-di/08.jpg');
  });

  it('counts visible characters of chapter HTML', () => {
    expect(textLength('<p>Một hai</p><p>ba</p>')).toBe(10);
    expect(textLength('<p>a&nbsp;b</p>')).toBe(3);
    expect(textLength('')).toBe(0);
  });

  it('computes the change in percent', () => {
    expect(pctChange(112, 100)).toBe(12);
    expect(pctChange(90, 120)).toBe(-25);
    expect(pctChange(5, 0)).toBeNull();
  });

  it('builds the current and previous periods in Vietnam dates', () => {
    const now = new Date('2026-11-11T18:30:00Z'); // 01:30 on the 12th in Vietnam
    expect(rangeQueries('7d', now)).toEqual({
      current: { from: '2026-11-06', to: '2026-11-12', granularity: 'day' },
      previous: { from: '2026-10-30', to: '2026-11-05', granularity: 'day' },
    });
    expect(rangeQueries('12m', now)).toEqual({
      current: { from: '2025-12-01', to: '2026-11-12', granularity: 'month' },
      previous: { from: '2024-12-01', to: '2025-11-30', granularity: 'month' },
    });
  });

  it('names the next chapter and summarises the list', () => {
    expect(nextChapterTitle([])).toBe('Chương 1');
    expect(nextChapterTitle([{ chapterNo: 3 }, { chapterNo: 12 }])).toBe('Chương 13');
    expect(summarizeChapters([{ status: 'PUBLISHED' }, { status: 'DRAFT' }, { status: 'SCHEDULED' }], 2)).toBe(
      '3 chương · 2 tập · 1 bản nháp · 1 chương hẹn giờ',
    );
    expect(summarizeChapters([], 0)).toBe('0 chương');
  });
});
