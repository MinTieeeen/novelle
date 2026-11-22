package com.novelle.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Public author page: the Author profile, the avatar of the user and statistics over the author's
 * <b>public</b> stories only (vw_PublicStory), so drafts and hidden stories are never counted.
 */
public class AuthorProfile {

    private int authorId;
    private String penName;
    private String bio;
    private String avatarUrl;
    private boolean isVerified;
    private int followerCount;
    private LocalDateTime authorSince;
    private int storyCount;
    private long chapterCount;
    private long viewCount;
    private long ratingCount;
    private BigDecimal ratingAvg;

    public int getAuthorId() { return authorId; }
    public void setAuthorId(int authorId) { this.authorId = authorId; }

    public String getPenName() { return penName; }
    public void setPenName(String penName) { this.penName = penName; }

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public boolean isVerified() { return isVerified; }
    public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

    public LocalDateTime getAuthorSince() { return authorSince; }
    public void setAuthorSince(LocalDateTime authorSince) { this.authorSince = authorSince; }

    public int getStoryCount() { return storyCount; }
    public void setStoryCount(int storyCount) { this.storyCount = storyCount; }

    public long getChapterCount() { return chapterCount; }
    public void setChapterCount(long chapterCount) { this.chapterCount = chapterCount; }

    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }

    public long getRatingCount() { return ratingCount; }
    public void setRatingCount(long ratingCount) { this.ratingCount = ratingCount; }

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }
}
