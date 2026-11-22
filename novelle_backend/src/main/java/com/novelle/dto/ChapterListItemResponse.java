package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.StudioChapter;

/** One chapter of my story in the studio chapter list (C1), without its content. */
public record ChapterListItemResponse(
        long chapterId,
        int chapterNo,
        String title,
        Integer volumeId,
        String status,
        int wordCount,
        long viewCount,
        Instant scheduledAt,
        Instant publishedAt,
        Instant updatedAt) {

    public static ChapterListItemResponse from(StudioChapter c) {
        return new ChapterListItemResponse(c.getChapterId(), c.getChapterNo(), c.getTitle(), c.getVolumeId(),
                c.getStatus(), c.getWordCount(), c.getViewCount(), Times.utc(c.getScheduledAt()),
                Times.utc(c.getPublishedAt()), Times.utc(c.getUpdatedAt()));
    }
}
