package com.novelle.dto;

import com.novelle.model.Genre;

/** GET /api/genres: one genre and its number of public stories. */
public record GenreResponse(int genreId, String name, String slug, String description, int storyCount) {

    public static GenreResponse from(Genre g) {
        return new GenreResponse(g.getGenreId(), g.getName(), g.getSlug(), g.getDescription(), g.getStoryCount());
    }
}
