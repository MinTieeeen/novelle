package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.ReadingListEntry;

/** A public story in a reading list (T3, T6). */
public record ReadingListItemResponse(StoryCardResponse story, int orderNo, String note, Instant addedAt) {

    public static ReadingListItemResponse from(ReadingListEntry e) {
        return new ReadingListItemResponse(StoryCardResponse.from(e), e.getOrderNo(), e.getNote(),
                Times.utc(e.getAddedAt()));
    }
}
