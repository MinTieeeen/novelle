package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.StoryStats;

/**
 * Dashboard statistics of one of my stories (D3). {@code aboveMyAverage}: rates above the average of my rated
 * stories (subquery).
 */
public record StoryStatsResponse(
        int storyId,
        String slug,
        String title,
        String coverUrl,
        String publishStatus,
        String completionStatus,
        int chapterCount,
        long viewCount,
        long views30d,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        boolean aboveMyAverage,
        StoryCardResponse.Genre primaryGenre,
        Instant lastChapterAt) {

    public static StoryStatsResponse from(StoryStats s) {
        return new StoryStatsResponse(s.getStoryId(), s.getSlug(), s.getTitle(), s.getCoverUrl(),
                s.getPublishStatus(), s.getCompletionStatus(), s.getChapterCount(), s.getViewCount(),
                s.getViews30d(), s.getFollowCount(), s.getRatingAvg(), s.getRatingCount(), s.isAboveMyAverage(),
                StoryCardResponse.Genre.from(s.getPrimaryGenre()), Times.utc(s.getLastChapterAt()));
    }
}
