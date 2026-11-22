package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.ChapterContent;

/**
 * JSON stored in {@code cache:chapter:{id}}: only the heavy part of a chapter (module-reading D3). Not returned
 * to clients as such; {@link ChapterReadResponse} combines it with the navigation read from SQL.
 */
public record ChapterContentCache(String title, String content, int wordCount, Instant publishedAt) {

    public static ChapterContentCache from(ChapterContent c) {
        return new ChapterContentCache(c.getTitle(), c.getContent(), c.getWordCount(), Times.utc(c.getPublishedAt()));
    }
}
