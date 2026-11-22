package com.novelle.service;

import java.util.Arrays;
import java.util.Locale;
import java.util.stream.Collectors;

import com.novelle.exception.ApiException;

/**
 * Whitelist of the {@code sort} parameter for story lists. {@link #orderBy()} is the only text that reaches
 * {@code ${orderBy}} in the mapper XML, so nothing from the request is ever concatenated into SQL.
 * <p>
 * The clauses use the aliases of the story queries: {@code s} = {@code vw_PublicStory},
 * {@code ft} = the full-text match (only joined when there is a search text). Every clause ends with
 * {@code s.StoryId DESC} so that paging is stable when the sort values are equal.
 */
public enum StorySort {

    UPDATED("updated", "s.LastChapterAt DESC"),
    NEWEST("newest", "s.PublishedAt DESC"),
    VIEWS("views", "s.ViewCount DESC"),
    RATING("rating", "s.RatingAvg DESC, s.RatingCount DESC"),
    FOLLOWS("follows", "s.FollowCount DESC"),
    RELEVANCE("relevance", "ft.[RANK] DESC");

    private static final String ALLOWED = Arrays.stream(values())
            .map(StorySort::param).collect(Collectors.joining(", "));

    private final String param;
    private final String orderBy;

    StorySort(String param, String orderBy) {
        this.param = param;
        this.orderBy = orderBy + ", s.StoryId DESC";
    }

    public String param() {
        return param;
    }

    /** Fixed ORDER BY list (without the keywords), for {@code ORDER BY ${orderBy}}. */
    public String orderBy() {
        return orderBy;
    }

    /**
     * The sort of a story list. Blank → {@code relevance} when there is a search text, otherwise {@code updated}.
     * Unknown values, and {@code relevance} without a search text, are 400 VALIDATION_FAILED on {@code sort}.
     */
    public static StorySort resolve(String value, boolean hasSearchText) {
        if (value == null || value.isBlank()) {
            return hasSearchText ? RELEVANCE : UPDATED;
        }
        String wanted = value.trim().toLowerCase(Locale.ROOT);
        StorySort sort = Arrays.stream(values())
                .filter(s -> s.param.equals(wanted))
                .findFirst()
                .orElseThrow(() -> ApiException.invalidField("sort", "must be one of " + ALLOWED));
        if (sort == RELEVANCE && !hasSearchText) {
            throw ApiException.invalidField("sort", "relevance needs a search text (q)");
        }
        return sort;
    }
}
