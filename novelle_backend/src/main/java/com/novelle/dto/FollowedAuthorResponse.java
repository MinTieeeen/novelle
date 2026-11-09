package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.FollowedAuthor;

/** An author I follow (F8). */
public record FollowedAuthorResponse(
        int authorId,
        String penName,
        String avatarUrl,
        @JsonProperty("isVerified") boolean isVerified,
        int followerCount,
        Instant followedAt) {

    public static FollowedAuthorResponse from(FollowedAuthor a) {
        return new FollowedAuthorResponse(a.getAuthorId(), a.getPenName(), a.getAvatarUrl(), a.isVerified(),
                a.getFollowerCount(), Times.utc(a.getFollowedAt()));
    }
}
