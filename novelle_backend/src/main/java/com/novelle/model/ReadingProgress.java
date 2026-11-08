package com.novelle.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Where a user stopped reading a story: {@code ReadingHistory} joined with its (public) chapter. */
public class ReadingProgress {

    private int storyId;
    private long chapterId;
    private int chapterNo;
    private String chapterTitle;
    private BigDecimal scrollPercent;
    private LocalDateTime updatedAt;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public long getChapterId() { return chapterId; }
    public void setChapterId(long chapterId) { this.chapterId = chapterId; }

    public int getChapterNo() { return chapterNo; }
    public void setChapterNo(int chapterNo) { this.chapterNo = chapterNo; }

    public String getChapterTitle() { return chapterTitle; }
    public void setChapterTitle(String chapterTitle) { this.chapterTitle = chapterTitle; }

    public BigDecimal getScrollPercent() { return scrollPercent; }
    public void setScrollPercent(BigDecimal scrollPercent) { this.scrollPercent = scrollPercent; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
