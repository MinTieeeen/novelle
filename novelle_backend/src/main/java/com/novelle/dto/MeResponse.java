package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.infrastructure.mybatis.RowVersion;
import com.novelle.model.AppUser;
import com.novelle.model.AuthorSummary;

/** The logged-in user (GET /api/me, register, login). {@code author} is present only for AUTHOR. */
public record MeResponse(
        int userId,
        String username,
        String email,
        String displayName,
        String avatarUrl,
        String bio,
        String role,
        String status,
        Instant createdAt,
        Instant lastLoginAt,
        RowVersion rowVersion,
        Author author) {

    public record Author(String penName, String bio, @JsonProperty("isVerified") boolean isVerified, int followerCount) {

        static Author from(AuthorSummary a) {
            return a == null ? null : new Author(a.getPenName(), a.getBio(), a.isVerified(), a.getFollowerCount());
        }
    }

    public static MeResponse from(AppUser u) {
        return new MeResponse(u.getUserId(), u.getUsername(), u.getEmail(), u.getDisplayName(), u.getAvatarUrl(),
                u.getBio(), u.getRole(), u.getStatus(), Times.utc(u.getCreatedAt()), Times.utc(u.getLastLoginAt()),
                u.getRowVersion(), Author.from(u.getAuthor()));
    }
}
