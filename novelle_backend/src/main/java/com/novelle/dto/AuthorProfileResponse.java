package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.AuthorProfile;

/** GET /api/authors/{authorId}: statistics cover public stories only (decision D4). */
public record AuthorProfileResponse(
        int authorId,
        String penName,
        String bio,
        String avatarUrl,
        @JsonProperty("isVerified") boolean isVerified,
        int followerCount,
        Instant authorSince,
        Stats stats) {

    /** {@code ratingAvg} is weighted by the number of ratings of each story; 0 when there is none. */
    public record Stats(int storyCount, long chapterCount, long viewCount, long ratingCount, BigDecimal ratingAvg) {
    }

    public static AuthorProfileResponse from(AuthorProfile a) {
        return new AuthorProfileResponse(a.getAuthorId(), a.getPenName(), a.getBio(), a.getAvatarUrl(),
                a.isVerified(), a.getFollowerCount(), Times.utc(a.getAuthorSince()),
                new Stats(a.getStoryCount(), a.getChapterCount(), a.getViewCount(), a.getRatingCount(),
                        a.getRatingAvg()));
    }
}
