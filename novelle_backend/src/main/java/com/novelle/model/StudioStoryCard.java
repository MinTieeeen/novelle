package com.novelle.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** One row of "my stories" in the studio (S1); also the base of the dashboard per-story statistics. */
public class StudioStoryCard {

    private int storyId;
    private String slug;
    private String title;
    private String coverUrl;
    private String publishStatus;
    private String completionStatus;
    private String ageRating;
    private int chapterCount;
    private int draftChapterCount;
    private long viewCount;
    private int followCount;
    private BigDecimal ratingAvg;
    private int ratingCount;
    private LocalDateTime lastChapterAt;
    private LocalDateTime updatedAt;
    private GenreRef primaryGenre;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }

    public String getPublishStatus() { return publishStatus; }
    public void setPublishStatus(String publishStatus) { this.publishStatus = publishStatus; }

    public String getCompletionStatus() { return completionStatus; }
    public void setCompletionStatus(String completionStatus) { this.completionStatus = completionStatus; }

    public String getAgeRating() { return ageRating; }
    public void setAgeRating(String ageRating) { this.ageRating = ageRating; }

    public int getChapterCount() { return chapterCount; }
    public void setChapterCount(int chapterCount) { this.chapterCount = chapterCount; }

    public int getDraftChapterCount() { return draftChapterCount; }
    public void setDraftChapterCount(int draftChapterCount) { this.draftChapterCount = draftChapterCount; }

    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }

    public int getFollowCount() { return followCount; }
    public void setFollowCount(int followCount) { this.followCount = followCount; }

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }

    public int getRatingCount() { return ratingCount; }
    public void setRatingCount(int ratingCount) { this.ratingCount = ratingCount; }

    public LocalDateTime getLastChapterAt() { return lastChapterAt; }
    public void setLastChapterAt(LocalDateTime lastChapterAt) { this.lastChapterAt = lastChapterAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public GenreRef getPrimaryGenre() { return primaryGenre; }
    public void setPrimaryGenre(GenreRef primaryGenre) { this.primaryGenre = primaryGenre; }
}
