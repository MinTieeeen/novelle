package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.ChapterDraft;
import com.novelle.model.StudioChapter;

/**
 * One of my chapters in the editor (C2, C3, C6–C9, R3). {@code content} is the sanitized HTML that is stored;
 * {@code version} is {@code UpdatedAt} (D4). {@code draft} is only set by C3, when the autosaved draft in Redis is
 * newer than the stored chapter.
 */
public record StudioChapterResponse(
        long chapterId,
        int storyId,
        int chapterNo,
        String title,
        String content,
        Integer volumeId,
        String status,
        int wordCount,
        long viewCount,
        Instant scheduledAt,
        Instant publishedAt,
        Instant createdAt,
        Instant version,
        Draft draft) {

    public record Draft(String title, String content, Instant savedAt) {

        static Draft from(ChapterDraft d) {
            return d == null ? null : new Draft(d.title(), d.content(), d.savedAt());
        }
    }

    public static StudioChapterResponse from(StudioChapter c, ChapterDraft draft) {
        return new StudioChapterResponse(c.getChapterId(), c.getStoryId(), c.getChapterNo(), c.getTitle(),
                c.getContent(), c.getVolumeId(), c.getStatus(), c.getWordCount(), c.getViewCount(),
                Times.utc(c.getScheduledAt()), Times.utc(c.getPublishedAt()), Times.utc(c.getCreatedAt()),
                Times.utc(c.getUpdatedAt()), Draft.from(draft));
    }

    public static StudioChapterResponse from(StudioChapter c) {
        return from(c, null);
    }
}
