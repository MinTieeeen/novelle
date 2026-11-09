package com.novelle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body of PUT /api/stories/{storyId}/ratings/me; a blank review is stored as NULL (rating without text). */
public record RatingRequest(
        @NotNull @Min(1) @Max(5) Integer score,
        @Size(max = 1000) String review) {
}
