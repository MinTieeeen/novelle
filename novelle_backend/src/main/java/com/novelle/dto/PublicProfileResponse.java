package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.AppUser;
import com.novelle.model.AuthorSummary;

/** GET /api/users/{username}: no email, status or login data. */
public record PublicProfileResponse(
        String username,
        String displayName,
        String avatarUrl,
        String bio,
        String role,
        Instant createdAt,
        Author author) {

    public record Author(int authorId, String penName, String bio,
                         @JsonProperty("isVerified") boolean isVerified, int followerCount) {

        static Author from(AuthorSummary a) {
            return a == null ? null
                    : new Author(a.getAuthorId(), a.getPenName(), a.getBio(), a.isVerified(), a.getFollowerCount());
        }
    }

    public static PublicProfileResponse from(AppUser u) {
        return new PublicProfileResponse(u.getUsername(), u.getDisplayName(), u.getAvatarUrl(), u.getBio(),
                u.getRole(), Times.utc(u.getCreatedAt()), Author.from(u.getAuthor()));
    }
}
