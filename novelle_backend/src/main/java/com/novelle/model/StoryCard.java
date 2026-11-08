package com.novelle.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A public story as listed on the home page, in search results and on an author page (from vw_PublicStory).
 * {@code description} holds at most the first 300 characters here; the full text is in {@link StoryDetail}.
 */
public class StoryCard {

    private int storyId;
    private String slug;
    private String title;
    private String description;
    private String coverUrl;
    private String completionStatus;
    private String ageRating;
    private int chapterCount;
    private long viewCount;
    private int followCount;
    private BigDecimal ratingAvg;
    private int ratingCount;
    private LocalDateTime lastChapterAt;
    private LocalDateTime publishedAt;
    private AuthorRef author;
    private GenreRef primaryGenre;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }

    public String getCompletionStatus() { return completionStatus; }
    public void setCompletionStatus(String completionStatus) { this.completionStatus = completionStatus; }

    public String getAgeRating() { return ageRating; }
    public void setAgeRating(String ageRating) { this.ageRating = ageRating; }

    public int getChapterCount() { return chapterCount; }
    public void setChapterCount(int chapterCount) { this.chapterCount = chapterCount; }

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

    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }

    public AuthorRef getAuthor() { return author; }
    public void setAuthor(AuthorRef author) { this.author = author; }

    public GenreRef getPrimaryGenre() { return primaryGenre; }
    public void setPrimaryGenre(GenreRef primaryGenre) { this.primaryGenre = primaryGenre; }
}
