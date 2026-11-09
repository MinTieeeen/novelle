package com.novelle.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of PATCH /api/studio/stories/{id} (S4). A null field is left unchanged; an empty {@code description} or
 * {@code coverUrl} clears it. {@code version} is the story's {@code version} as last read (D4).
 */
public record UpdateStoryRequest(
        @Size(max = 300) @Pattern(regexp = StudioPatterns.NOT_BLANK, message = "must not be blank") String title,
        @Size(max = 4000) String description,
        @Pattern(regexp = StudioPatterns.COVER_URL_OR_EMPTY, message = "must be one of the provided covers")
        String coverUrl,
        @Pattern(regexp = StudioPatterns.AGE_RATING) String ageRating,
        @Pattern(regexp = StudioPatterns.COMPLETION_STATUS) String completionStatus,
        @NotNull Instant version) {

    /** True when at least one field besides {@code version} was sent. */
    public boolean hasChanges() {
        return title != null || description != null || coverUrl != null || ageRating != null
                || completionStatus != null;
    }
}
