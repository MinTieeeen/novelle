package com.novelle.model;

import java.time.LocalDateTime;

/** A reader following me (AuthorFollow ⋈ User), newest first on the dashboard. */
public class FollowerRow {

    private int userId;
    private String username;
    private String displayName;
    private String avatarUrl;
    private LocalDateTime followedAt;

    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public LocalDateTime getFollowedAt() { return followedAt; }
    public void setFollowedAt(LocalDateTime followedAt) { this.followedAt = followedAt; }
}
