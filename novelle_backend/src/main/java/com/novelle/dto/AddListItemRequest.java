package com.novelle.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/** Body of POST /api/reading-lists/{listId}/items; a blank note is stored as NULL. */
public record AddListItemRequest(
        @NotNull @Positive Integer storyId,
        @Size(max = 300) String note) {
}
