package com.novelle.dto;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.ReadingList;

/** A reading list with its owner and one page of its public stories (T3). */
public record ReadingListDetailResponse(
        int listId,
        String name,
        String description,
        @JsonProperty("isPublic") boolean isPublic,
        int itemCount,
        Instant createdAt,
        Instant updatedAt,
        UserRefResponse owner,
        @JsonProperty("isOwner") boolean isOwner,
        PageResponse<ReadingListItemResponse> items) {

    public static ReadingListDetailResponse from(ReadingList l, boolean isOwner,
                                                 PageResponse<ReadingListItemResponse> items) {
        return new ReadingListDetailResponse(l.getListId(), l.getName(), l.getDescription(), l.isPublic(),
                l.getItemCount(), Times.utc(l.getCreatedAt()), Times.utc(l.getUpdatedAt()),
                UserRefResponse.from(l.getOwner()), isOwner, items);
    }
}
