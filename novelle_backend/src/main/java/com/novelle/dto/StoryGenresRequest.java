package com.novelle.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body of PUT /api/studio/stories/{id}/genres (S5): 1–3 distinct genres, the primary one among them (RB6). */
public record StoryGenresRequest(
        @NotNull @Size(min = 1, max = 3) List<@NotNull Integer> genreIds,
        @NotNull Integer primaryGenreId) {
}
