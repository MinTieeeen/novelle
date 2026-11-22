package com.novelle.model;

import java.time.LocalDateTime;

import com.novelle.infrastructure.mybatis.RowVersion;

/**
 * Row of dbo.[User] (without PasswordHash) plus the optional Author profile.
 * Timestamps are UTC: DATETIME2 has no offset, so they are read as LocalDateTime and converted in the DTOs.
 */
public class AppUser {

    private int userId;
    private String username;
    private String email;
    private String displayName;
    private String avatarUrl;
    private String bio;
    private String role;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;
    private RowVersion rowVersion;
    private AuthorSummary author;

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

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }

    public RowVersion getRowVersion() { return rowVersion; }
    public void setRowVersion(RowVersion rowVersion) { this.rowVersion = rowVersion; }

    public AuthorSummary getAuthor() { return author; }
    public void setAuthor(AuthorSummary author) { this.author = author; }
}
