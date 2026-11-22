package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.ReadingList;

/**
 * A reading list without its stories (T1, T2, T4, T9). {@code itemCount} counts every row, also stories that were
 * hidden since (docs/module-library.md D3).
 */
public record ReadingListSummaryResponse(
        int listId,
        String name,
        String description,
        @JsonProperty("isPublic") boolean isPublic,
        int itemCount,
        Instant createdAt,
        Instant updatedAt) {

    public static ReadingListSummaryResponse from(ReadingList l) {
        return new ReadingListSummaryResponse(l.getListId(), l.getName(), l.getDescription(), l.isPublic(),
                l.getItemCount(), Times.utc(l.getCreatedAt()), Times.utc(l.getUpdatedAt()));
    }
}
