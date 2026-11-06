package com.novelle.dto;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Query parameters of GET /api/stories (bound with {@code @ModelAttribute}). Lists accept
 * {@code genres=a,b} or {@code genres=a&genres=b}. Single-field rules are checked here; enum values,
 * {@code minChapters <= maxChapters}, sort and paging are checked by StorySearchService.
 *
 * @param q          search text (full-text, accent-insensitive, each word as a prefix)
 * @param genres     genre slugs
 * @param genreMode  {@code all} (default: the story has every genre) or {@code any}
 * @param tags       tag slugs; the story must have every tag
 * @param status     ONGOING, COMPLETED or HIATUS
 * @param ageRating  ALL, 13+ or 18+
 * @param sort       updated, newest, views, rating, follows, relevance
 */
public record StorySearchRequest(
        @Size(max = 100) String q,
        @Size(max = 5) List<String> genres,
        String genreMode,
        @Size(max = 5) List<String> tags,
        String status,
        String ageRating,
        @PositiveOrZero Integer minChapters,
        @PositiveOrZero Integer maxChapters,
        @DecimalMin("0") @DecimalMax("5") BigDecimal minRating,
        String sort,
        Integer page,
        Integer size) {
}
