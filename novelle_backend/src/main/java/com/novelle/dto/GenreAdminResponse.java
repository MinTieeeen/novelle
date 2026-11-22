package com.novelle.dto;

import com.novelle.model.AdminGenre;

/** A genre in the admin catalog (G1–G3); {@code storyCount} counts every story that is not deleted. */
public record GenreAdminResponse(int genreId, String name, String slug, String description, int sortOrder,
                                 int storyCount) {

    public static GenreAdminResponse from(AdminGenre g) {
        return new GenreAdminResponse(g.getGenreId(), g.getName(), g.getSlug(), g.getDescription(),
                g.getSortOrder(), g.getStoryCount());
    }
}
