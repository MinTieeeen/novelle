package com.novelle.model;

import java.time.LocalDateTime;

/**
 * A chapter of one of my stories, any status, not deleted. {@code content} is only filled by the statements that
 * read the body (editor, revisions); lists leave it null. {@code updatedAt} is the optimistic locking token
 * ({@code version}, docs/module-studio.md D4).
 */
public class StudioChapter {

    private long chapterId;
    private int storyId;
    private Integer volumeId;
    private int chapterNo;
    private String title;
    private String content;
    private int wordCount;
    private String status;
    private LocalDateTime scheduledAt;
    private LocalDateTime publishedAt;
    private long viewCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public long getChapterId() { return chapterId; }
    public void setChapterId(long chapterId) { this.chapterId = chapterId; }

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public Integer getVolumeId() { return volumeId; }
    public void setVolumeId(Integer volumeId) { this.volumeId = volumeId; }

    public int getChapterNo() { return chapterNo; }
    public void setChapterNo(int chapterNo) { this.chapterNo = chapterNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public int getWordCount() { return wordCount; }
    public void setWordCount(int wordCount) { this.wordCount = wordCount; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getScheduledAt() { return scheduledAt; }
    public void setScheduledAt(LocalDateTime scheduledAt) { this.scheduledAt = scheduledAt; }

    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }

    public long getViewCount() { return viewCount; }
    public void setViewCount(long viewCount) { this.viewCount = viewCount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
