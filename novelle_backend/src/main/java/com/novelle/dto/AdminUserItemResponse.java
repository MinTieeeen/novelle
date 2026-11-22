package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.AdminUser;

/** One row of the admin user list (U1); {@code bannedAt} only for a BANNED account. */
public record AdminUserItemResponse(
        int userId,
        String username,
        String email,
        String displayName,
        String avatarUrl,
        String role,
        String status,
        Instant createdAt,
        Instant lastLoginAt,
        Instant bannedAt) {

    public static AdminUserItemResponse from(AdminUser u) {
        return new AdminUserItemResponse(u.getUserId(), u.getUsername(), u.getEmail(), u.getDisplayName(),
                u.getAvatarUrl(), u.getRole(), u.getStatus(), Times.utc(u.getCreatedAt()),
                Times.utc(u.getLastLoginAt()), Times.utc(u.getBannedAt()));
    }
}
