package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.StudioAuthorProfile;

/** My author profile in the studio (S10, S11). */
public record AuthorProfileStudioResponse(
        int authorId,
        String penName,
        String bio,
        @JsonProperty("isVerified") boolean isVerified,
        int followerCount,
        Instant authorSince) {

    public static AuthorProfileStudioResponse from(StudioAuthorProfile p) {
        return new AuthorProfileStudioResponse(p.getAuthorId(), p.getPenName(), p.getBio(), p.isVerified(),
                p.getFollowerCount(), Times.utc(p.getCreatedAt()));
    }
}
