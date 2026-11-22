package com.novelle.model;

import java.math.BigDecimal;

/** One row of dbo.vw_AuthorStats (aggregate over the author's stories that are not deleted), dashboard D1. */
public class AuthorDashboardStats {

    private int storyCount;
    private int publishedStoryCount;
    private long chapterCount;
    private long wordCount;
    private long viewCount;
    private int followerCount;
    private long storyFollowCount;
    private long ratingCount;
    private BigDecimal ratingAvg;

    public int getStoryCount() { return storyCount; }
    public void setStoryCount(int storyCount) { this.storyCount = storyCount; }

    public int getPublishedStoryCount() { return publishedStoryCount; }
    public void setPublishedStoryCount(int publishedStoryCount) { this.publishedStoryCount = publishedStoryCount; }

    public long getChapterCount() { return chapterCount; }
    public void setChapterCount(long chapterCount) { this.chapterCount = chapterCount; }

    public long getWordCount() { return wordCount; }
    public void setWordCount(long wordCount) { this.wordCount = wordCount; }

    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

    public long getStoryFollowCount() { return storyFollowCount; }
    public void setStoryFollowCount(long storyFollowCount) { this.storyFollowCount = storyFollowCount; }

    public long getRatingCount() { return ratingCount; }
    public void setRatingCount(long ratingCount) { this.ratingCount = ratingCount; }

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }
}
