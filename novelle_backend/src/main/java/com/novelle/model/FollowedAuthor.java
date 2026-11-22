package com.novelle.model;

import java.time.LocalDateTime;

/** An author I follow (AuthorFollow ⋈ Author ⋈ User). */
public class FollowedAuthor {

    private int authorId;
    private String penName;
    private String avatarUrl;
    private boolean isVerified;
    private int followerCount;
    private LocalDateTime followedAt;

    public int getAuthorId() { return authorId; }
    public void setAuthorId(int authorId) { this.authorId = authorId; }

    public String getPenName() { return penName; }
    public void setPenName(String penName) { this.penName = penName; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public boolean isVerified() { return isVerified; }
    public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

    public LocalDateTime getFollowedAt() { return followedAt; }
    public void setFollowedAt(LocalDateTime followedAt) { this.followedAt = followedAt; }
}
