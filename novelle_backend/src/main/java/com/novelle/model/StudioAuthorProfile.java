package com.novelle.model;

import java.time.LocalDateTime;

/** My author profile as edited in the studio (dbo.Author). */
public class StudioAuthorProfile {

    private int authorId;
    private String penName;
    private String bio;
    private boolean isVerified;
    private int followerCount;
    private LocalDateTime createdAt;

    public int getAuthorId() { return authorId; }
    public void setAuthorId(int authorId) { this.authorId = authorId; }

    public String getPenName() { return penName; }
    public void setPenName(String penName) { this.penName = penName; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public boolean isVerified() { return isVerified; }
    public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
