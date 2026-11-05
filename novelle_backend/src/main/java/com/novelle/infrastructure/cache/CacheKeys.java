package com.novelle.infrastructure.cache;

/**
 * The only place that builds {@code cache:*} key names (data-dictionary section 8). Modules that change
 * cached data evict these keys through {@link CacheService#evict(String...)} (docs/module-catalog.md section 9).
 */
public final class CacheKeys {

    /** {@code GenreResponse[]} of GET /api/genres. */
    public static final String GENRE_LIST = "cache:genre:list";

    /** {@code HomeResponse} of GET /api/home. */
    public static final String HOME = "cache:home";

    /** Prefix shared by every cache entry (used by tests to clean up). */
    public static final String PREFIX = "cache:";

    private CacheKeys() {
    }

    /** {@code StoryDetailResponse} of GET /api/stories/{slug}, keyed by id so writers can evict without the slug. */
    public static String story(int storyId) {
        return "cache:story:" + storyId;
    }
}
