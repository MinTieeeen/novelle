package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.AdminStory;
import com.novelle.model.AuthorRef;

/** A story of any author for moderation (C1–C3); {@code hiddenReason} only when HIDDEN. */
public record AdminStoryItemResponse(
        int storyId,
        String slug,
        String title,
        String coverUrl,
        String publishStatus,
        String hiddenReason,
        String completionStatus,
        String ageRating,
        Author author,
        int chapterCount,
        int draftChapterCount,
        long viewCount,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        StoryCardResponse.Genre primaryGenre,
        Instant lastChapterAt,
        Instant updatedAt) {

    public record Author(int authorId, String penName, @JsonProperty("isVerified") boolean isVerified) {

        static Author from(AuthorRef a) {
            return a == null ? null : new Author(a.getAuthorId(), a.getPenName(), a.isVerified());
        }
    }

    public static AdminStoryItemResponse from(AdminStory s) {
        return new AdminStoryItemResponse(s.getStoryId(), s.getSlug(), s.getTitle(), s.getCoverUrl(),
                s.getPublishStatus(), s.getHiddenReason(), s.getCompletionStatus(), s.getAgeRating(),
                Author.from(s.getAuthor()), s.getChapterCount(), s.getDraftChapterCount(), s.getViewCount(),
                s.getFollowCount(), s.getRatingAvg(), s.getRatingCount(),
                StoryCardResponse.Genre.from(s.getPrimaryGenre()), Times.utc(s.getLastChapterAt()),
                Times.utc(s.getUpdatedAt()));
    }
}
