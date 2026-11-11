import { describe, expect, it } from 'vitest';
import { serializeParams } from '@/api/http';
import { firstChapter } from '@/types/story';
import {
  activeFilterCount,
  applyChapterRange,
  chapterRangeOf,
  DEFAULT_SEARCH,
  normalizeQuery,
  parseSearchParams,
  toApiQuery,
  toSearchParams,
} from '@/types/storySearch';
import { chapterRange, formatMonthYear } from '@/utils/format';

const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs));

describe('parseSearchParams', () => {
  it('gives the defaults for an empty URL', () => {
    expect(parse('')).toEqual({ ...DEFAULT_SEARCH, q: undefined });
  });

  it('reads every filter', () => {
    const p = parse(
      'q=kiếm&genres=kiem-hiep&genres=huyen-huyen&genreMode=any&tags=bao-thu&status=ONGOING&ageRating=18%2B' +
        '&minChapters=50&maxChapters=200&minRating=4&sort=views&page=2&size=30&view=list',
    );
    expect(p).toEqual({
      q: 'kiếm',
      genres: ['kiem-hiep', 'huyen-huyen'],
      genreMode: 'any',
      tags: ['bao-thu'],
      status: 'ONGOING',
      ageRating: '18+',
      minChapters: 50,
      maxChapters: 200,
      minRating: 4,
      sort: 'views',
      page: 2,
      size: 30,
      view: 'list',
    });
  });

  it('drops bad values field by field instead of failing', () => {
    const p = parse('status=DONE&ageRating=21&minChapters=-1&minRating=9&sort=random&page=x&size=500&view=table&genres=Bad%20Slug');
    expect(p).toEqual({ ...DEFAULT_SEARCH, q: undefined });
  });

  it('accepts comma lists, lowercases, dedupes and caps genres and tags at 5', () => {
    expect(parse('genres=A,b&genres=b').genres).toEqual(['a', 'b']);
    expect(parse('tags=a,b,c,d,e,f').tags).toHaveLength(5);
  });

  it('applies the backend cross-field rules', () => {
    expect(parse('minChapters=200&maxChapters=49').maxChapters).toBeUndefined();
    expect(parse('sort=relevance').sort).toBeUndefined();
    expect(parse('q=kiem&sort=relevance').sort).toBe('relevance');
  });

  it('drops a q without any letter or digit (backend 400) and trims long text to 100', () => {
    expect(parse('q=%20%20!!').q).toBeUndefined();
    expect(normalizeQuery('  Kiếm Lai  ')).toBe('Kiếm Lai');
    expect(normalizeQuery('a'.repeat(150))).toHaveLength(100);
  });
});

describe('toSearchParams / toApiQuery', () => {
  it('round-trips and leaves defaults out of the URL', () => {
    const p = parse('q=kiem&genres=kiem-hiep&genres=tien-hiep&minRating=4&page=1&view=list');
    expect(parseSearchParams(toSearchParams(p))).toEqual(p);
    expect(toSearchParams(DEFAULT_SEARCH).toString()).toBe('');
    expect(toSearchParams({ ...DEFAULT_SEARCH, genreMode: 'any' }).toString()).toBe(''); // no genre, no mode
  });

  it('builds the API query without the UI-only view and without empty filters', () => {
    expect(toApiQuery({ ...DEFAULT_SEARCH, view: 'list' })).toEqual({ page: 0, size: 20 });
    expect(toApiQuery(parse('genres=kiem-hiep&q=kiem&sort=relevance'))).toEqual({
      page: 0,
      size: 20,
      q: 'kiem',
      genres: ['kiem-hiep'],
      genreMode: 'all',
      sort: 'relevance',
    });
  });

  it('serializes arrays as repeated keys for Spring (not genres[]=)', () => {
    expect(serializeParams({ genres: ['a', 'b'], q: 'kiếm hiệp', page: 0, empty: '', none: undefined })).toBe(
      'genres=a&genres=b&q=ki%E1%BA%BFm+hi%E1%BB%87p&page=0',
    );
  });
});

describe('chapter ranges and counts', () => {
  it('maps the "Số chương" chips to min / max and back', () => {
    expect(applyChapterRange('lt50')).toEqual({ minChapters: undefined, maxChapters: 49 });
    expect(applyChapterRange('gte500')).toEqual({ minChapters: 500, maxChapters: undefined });
    expect(chapterRangeOf({ minChapters: 50 })).toBe('gte50');
    expect(chapterRangeOf({})).toBe('all');
    expect(chapterRangeOf({ minChapters: 10, maxChapters: 20 })).toBeNull();
  });

  it('counts active filters', () => {
    expect(activeFilterCount(parse('genres=a&genres=b&tags=c&status=ONGOING&minChapters=50&minRating=4&q=x'))).toBe(6);
    expect(activeFilterCount(DEFAULT_SEARCH)).toBe(0);
  });
});

describe('story helpers', () => {
  it('finds the first chapter across volumes and loose chapters', () => {
    const ch = (chapterId: number, chapterNo: number) => ({ chapterId, chapterNo, title: `Chương ${chapterNo}` });
    expect(
      firstChapter({
        volumes: [{ volumeId: 1, volumeNo: 1, title: 'Tập 1', chapters: [ch(12, 3), ch(11, 2)] }],
        looseChapters: [ch(10, 1)],
      })?.chapterId,
    ).toBe(10);
    expect(firstChapter({ volumes: [], looseChapters: [] })).toBeNull();
  });

  it('formats a month and a chapter range', () => {
    expect(formatMonthYear('2026-03-04T10:00:00Z')).toBe('tháng 3/2026');
    expect(chapterRange([41, 87, 50])).toBe('Chương 41–87');
    expect(chapterRange([5])).toBe('Chương 5');
    expect(chapterRange([])).toBe('');
  });
});
