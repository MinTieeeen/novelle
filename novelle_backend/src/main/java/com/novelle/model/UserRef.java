package com.novelle.model;

/** A user shown next to something they did (applicant, reviewer, rating author). */
public class UserRef {

    private int userId;
    private String username;
    private String avatarUrl;

    public int getUserId() { return userId; }
    public void setUserId(int userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
}
