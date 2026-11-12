import type { ChapterToc, VolumeToc } from '@/types/story';
import { chapterRange } from '@/utils/format';

export interface TocGroup {
  key: string;
  /** "Tập 2 · Đèn trên mặt nước", "Chương lẻ" or "Danh sách chương" */
  heading: string;
  /** "Chương 41–87" */
  range: string;
  chapters: ChapterToc[];
}

/** One group per volume (in order), loose chapters last; chapters oldest first. */
export function buildTocGroups(volumes: VolumeToc[], looseChapters: ChapterToc[]): TocGroup[] {
  const byNo = (list: ChapterToc[]) => [...list].sort((a, b) => a.chapterNo - b.chapterNo);
  const out: TocGroup[] = volumes.map((v) => ({
    key: `v${v.volumeId}`,
    heading: `Tập ${v.volumeNo} · ${v.title}`,
    range: chapterRange(v.chapters.map((c) => c.chapterNo)),
    chapters: byNo(v.chapters),
  }));
  if (looseChapters.length > 0) {
    out.push({
      key: 'loose',
      heading: volumes.length > 0 ? 'Chương lẻ' : 'Danh sách chương',
      range: chapterRange(looseChapters.map((c) => c.chapterNo)),
      chapters: byNo(looseChapters),
    });
  }
  return out;
}
