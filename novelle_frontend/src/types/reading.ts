/** GET /api/chapters/{chapterId}. Optional fields are omitted from the JSON when absent. */
export interface ChapterRead {
  chapterId: number;
  chapterNo: number;
  title: string;
  /** Sanitized HTML from the editor; sanitize again before rendering (utils/sanitizeHtml). */
  content: string;
  wordCount: number;
  publishedAt: string;
  viewCount: number;
  story: { storyId: number; slug: string; title: string; author: { authorId: number; penName: string } };
  volume?: { volumeId: number; volumeNo: number; title: string } | null;
  prevChapterId?: number | null;
  nextChapterId?: number | null;
  /** Only for a logged-in reader who already read this chapter, 0–100. */
  myScrollPercent?: number | null;
}

/** GET / PUT /api/reading-progress/{storyId} */
export interface ReadingProgress {
  storyId: number;
  chapterId: number;
  chapterNo: number;
  chapterTitle: string;
  scrollPercent: number;
  updatedAt: string;
}

/** Body of PUT /api/reading-progress/{storyId}: scrollPercent 0–100, rounded to 2 decimals by the server. */
export interface SaveProgressBody {
  chapterId: number;
  scrollPercent: number;
}
