package com.novelle.model;

import java.time.LocalDateTime;

/** The heavy part of a published chapter, cached as {@code cache:chapter:{id}} (docs/module-reading.md D3). */
public class ChapterContent {

    private String title;
    private String content;
    private int wordCount;
    private LocalDateTime publishedAt;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    /** Sanitized HTML (sanitized when the author saves it, M6). */
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public int getWordCount() { return wordCount; }
    public void setWordCount(int wordCount) { this.wordCount = wordCount; }

    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
}
