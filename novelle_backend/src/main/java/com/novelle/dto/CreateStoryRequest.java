package com.novelle.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/studio/stories (S2). Genre rules (RB6: distinct, existing, primary in the list) and the tag
 * limit after merging duplicates are checked by the service; the list sizes here only bound the input.
 */
public record CreateStoryRequest(
        @NotBlank @Size(max = 300) String title,
        @Size(max = 4000) String description,
        @Pattern(regexp = StudioPatterns.COVER_URL, message = "must be one of the provided covers") String coverUrl,
        @NotNull @Pattern(regexp = StudioPatterns.AGE_RATING) String ageRating,
        @NotNull @Pattern(regexp = StudioPatterns.COMPLETION_STATUS) String completionStatus,
        @NotNull @Size(min = 1, max = 3) List<@NotNull Integer> genreIds,
        @NotNull Integer primaryGenreId,
        @Size(max = 30) List<String> tags) {
}
