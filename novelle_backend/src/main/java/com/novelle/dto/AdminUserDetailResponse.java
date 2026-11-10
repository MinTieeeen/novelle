package com.novelle.dto;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.AdminUser;
import com.novelle.model.StatusCount;

/**
 * One account for an administrator (U2–U5). {@code ban} only when BANNED; {@code author} only for an AUTHOR;
 * {@code authorRequests} counts the user's author requests per status.
 */
public record AdminUserDetailResponse(
        int userId,
        String username,
        String email,
        String displayName,
        String avatarUrl,
        String role,
        String status,
        Instant createdAt,
        Instant lastLoginAt,
        Ban ban,
        Author author,
        RequestCounts authorRequests) {

    public record Ban(String reason, Instant bannedAt, UserRef by) {
    }

    public record UserRef(Integer userId, String username) {
    }

    public record Author(String penName, @JsonProperty("isVerified") boolean isVerified, int followerCount,
                         int storyCount) {
    }

    public record RequestCounts(int pending, int approved, int rejected, int cancelled) {

        static RequestCounts from(List<StatusCount> counts) {
            int p = 0, a = 0, r = 0, c = 0;
            for (StatusCount sc : counts) {
                switch (sc.getStatus()) {
                    case "PENDING" -> p = sc.getTotal();
                    case "APPROVED" -> a = sc.getTotal();
                    case "REJECTED" -> r = sc.getTotal();
                    case "CANCELLED" -> c = sc.getTotal();
                    default -> { }
                }
            }
            return new RequestCounts(p, a, r, c);
        }
    }

    public static AdminUserDetailResponse from(AdminUser u, List<StatusCount> requestCounts) {
        Ban ban = !"BANNED".equals(u.getStatus()) ? null
                : new Ban(u.getBanReason(), Times.utc(u.getBannedAt()),
                        u.getBannedById() == null ? null : new UserRef(u.getBannedById(), u.getBannedByUsername()));
        AdminUser.AuthorPart a = u.getAuthor();
        Author author = a == null ? null
                : new Author(a.getPenName(), a.isVerified(), a.getFollowerCount(), a.getStoryCount());
        return new AdminUserDetailResponse(u.getUserId(), u.getUsername(), u.getEmail(), u.getDisplayName(),
                u.getAvatarUrl(), u.getRole(), u.getStatus(), Times.utc(u.getCreatedAt()),
                Times.utc(u.getLastLoginAt()), ban, author, RequestCounts.from(requestCounts));
    }
}
