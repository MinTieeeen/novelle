package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.ChapterRevision;

/** A saved earlier version of a chapter (R1 without {@code content}, R2 with it). */
public record RevisionResponse(
        int revisionNo,
        String title,
        int wordCount,
        Editor editedBy,
        Instant createdAt,
        String content) {

    public record Editor(int authorId, String penName) {
    }

    public static RevisionResponse from(ChapterRevision r) {
        return new RevisionResponse(r.getRevisionNo(), r.getTitle(), r.getWordCount(),
                new Editor(r.getEditedById(), r.getEditedByPenName()), Times.utc(r.getCreatedAt()), r.getContent());
    }
}
