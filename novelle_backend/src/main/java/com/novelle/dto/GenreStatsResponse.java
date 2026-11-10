package com.novelle.dto;

import java.util.List;

/** S3: public stories and their views per genre, most stories first; a story counts in each of its genres. */
public record GenreStatsResponse(List<Item> items) {

    public record Item(int genreId, String name, String slug, long storyCount, long totalViews) {
    }
}
