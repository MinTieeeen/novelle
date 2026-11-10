package com.novelle.model;

import java.time.LocalDateTime;

/**
 * A user account as an administrator sees it (U1, U2). The list fills only the account columns and
 * {@code bannedAt}; the detail also fills the ban author and, for an AUTHOR, the {@link AuthorPart}.
 */
public class AdminUser {

    private int userId;
    private String username;
    private String email;
    private String displayName;
    private String avatarUrl;
    private String role;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;
    private String banReason;
    private LocalDateTime bannedAt;
    private Integer bannedById;
    private String bannedByUsername;
    private AuthorPart author;

    /** Author profile of the user (User ⟕ Author); null when the user is not an AUTHOR. */
    public static class AuthorPart {

        private String penName;
        private boolean isVerified;
        private int followerCount;
        private int storyCount;

        public String getPenName() { return penName; }
        public void setPenName(String penName) { this.penName = penName; }

        public boolean isVerified() { return isVerified; }
        public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

        public int getFollowerCount() { return followerCount; }
        public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

        public int getStoryCount() { return storyCount; }
        public void setStoryCount(int storyCount) { this.storyCount = storyCount; }
    }

    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }

    public String getBanReason() { return banReason; }
    public void setBanReason(String banReason) { this.banReason = banReason; }

    public LocalDateTime getBannedAt() { return bannedAt; }
    public void setBannedAt(LocalDateTime bannedAt) { this.bannedAt = bannedAt; }

    public Integer getBannedById() { return bannedById; }
    public void setBannedById(Integer bannedById) { this.bannedById = bannedById; }

    public String getBannedByUsername() { return bannedByUsername; }
    public void setBannedByUsername(String bannedByUsername) { this.bannedByUsername = bannedByUsername; }

    public AuthorPart getAuthor() { return author; }
    public void setAuthor(AuthorPart author) { this.author = author; }
}
