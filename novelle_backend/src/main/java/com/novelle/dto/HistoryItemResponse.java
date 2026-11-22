package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.ChapterToc;
import com.novelle.model.HistoryItem;

/** One line of my reading history (H1); {@code lastChapter} is absent when that chapter is no longer public. */
public record HistoryItemResponse(
        StoryCardResponse story,
        LastChapter lastChapter,
        BigDecimal scrollPercent,
        Instant updatedAt) {

    public static HistoryItemResponse from(HistoryItem h) {
        ChapterToc c = h.getLastChapter();
        return new HistoryItemResponse(StoryCardResponse.from(h),
                c == null ? null : new LastChapter(c.getChapterId(), c.getChapterNo(), c.getTitle()),
                h.getScrollPercent(), Times.utc(h.getReadAt()));
    }

    public record LastChapter(long chapterId, int chapterNo, String title) {
    }
}
