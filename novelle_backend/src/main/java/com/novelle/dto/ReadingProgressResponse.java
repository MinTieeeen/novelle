package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.ReadingProgress;

/** Where the current user stopped reading a story (PUT and GET /api/reading-progress/{storyId}). */
public record ReadingProgressResponse(
        int storyId,
        long chapterId,
        int chapterNo,
        String chapterTitle,
        BigDecimal scrollPercent,
        Instant updatedAt) {

    public static ReadingProgressResponse from(ReadingProgress p) {
        return new ReadingProgressResponse(p.getStoryId(), p.getChapterId(), p.getChapterNo(), p.getChapterTitle(),
                p.getScrollPercent(), Times.utc(p.getUpdatedAt()));
    }
}
