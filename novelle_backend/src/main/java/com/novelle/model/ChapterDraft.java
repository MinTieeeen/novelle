package com.novelle.model;

import java.time.Instant;

/** An autosaved chapter draft read from the Redis hash {@code draft:{userId}:{chapterId}} (module-studio D8). */
public record ChapterDraft(String title, String content, Instant savedAt) {
}
