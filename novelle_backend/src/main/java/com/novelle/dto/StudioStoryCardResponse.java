package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.StudioStoryCard;

/** One of my stories in the studio list (S1). {@code chapterCount} counts published chapters only. */
public record StudioStoryCardResponse(
        int storyId,
        String slug,
        String title,
        String coverUrl,
        String publishStatus,
        String completionStatus,
        String ageRating,
        int chapterCount,
        int draftChapterCount,
        long viewCount,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        StoryCardResponse.Genre primaryGenre,
        Instant lastChapterAt,
        Instant updatedAt) {

    public static StudioStoryCardResponse from(StudioStoryCard c) {
        return new StudioStoryCardResponse(c.getStoryId(), c.getSlug(), c.getTitle(), c.getCoverUrl(),
                c.getPublishStatus(), c.getCompletionStatus(), c.getAgeRating(), c.getChapterCount(),
                c.getDraftChapterCount(), c.getViewCount(), c.getFollowCount(), c.getRatingAvg(), c.getRatingCount(),
                StoryCardResponse.Genre.from(c.getPrimaryGenre()), Times.utc(c.getLastChapterAt()),
                Times.utc(c.getUpdatedAt()));
    }
}
