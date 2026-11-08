package com.novelle.model;

import java.time.LocalDateTime;

/** One published chapter in a table of contents (no content: that is read by the reading module). */
public class ChapterToc {

    private long chapterId;
    private int chapterNo;
    private String title;
    private LocalDateTime publishedAt;

    public long getChapterId() { return chapterId; }
    public void setChapterId(long chapterId) { this.chapterId = chapterId; }

    public int getChapterNo() { return chapterNo; }
    public void setChapterNo(int chapterNo) { this.chapterNo = chapterNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
}
