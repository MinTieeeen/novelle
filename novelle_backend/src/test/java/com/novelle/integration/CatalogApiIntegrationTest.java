package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** C1 GET /api/genres, C2 GET /api/tags. */
class CatalogApiIntegrationTest extends CatalogIntegrationSupport {

    @Autowired
    private CacheTtlProperties ttlProperties;

    /** Public stories per genre, written independently of the mapper (DISTINCT over the base table). */
    private Map<Integer, Long> expectedGenreCounts() {
        Map<Integer, Long> counts = new HashMap<>();
        jdbc.queryForList("""
                SELECT g.GenreId, COUNT(DISTINCT s.StoryId) AS N
                FROM dbo.Genre g
                LEFT JOIN dbo.StoryGenre sg ON sg.GenreId = g.GenreId
                LEFT JOIN dbo.Story s ON s.StoryId = sg.StoryId AND s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0
                GROUP BY g.GenreId""").forEach(r -> counts.put(((Number) r.get("GenreId")).intValue(),
                ((Number) r.get("N")).longValue()));
        return counts;
    }

    @Test
    void genresAreInSortOrderWithPublicStoryCounts() throws Exception {
        List<Integer> order = jdbc.queryForList("SELECT GenreId FROM dbo.Genre ORDER BY SortOrder, GenreId",
                Integer.class);
        Map<Integer, Long> expected = expectedGenreCounts();

        JsonNode genres = ok("/api/genres");

        List<Integer> ids = new ArrayList<>();
        genres.forEach(g -> {
            ids.add(g.get("genreId").asInt());
            assertThat(g.get("storyCount").asLong())
                    .as("storyCount of %s", g.get("slug").asText())
                    .isEqualTo(expected.get(g.get("genreId").asInt()));
        });
        assertThat(ids).isEqualTo(order).hasSize(20);
    }

    @Test
    void hiddenStoriesAreNotCounted() throws Exception {
        Map<String, Object> s = row("""
                SELECT TOP (1) sg.StoryId, sg.GenreId FROM dbo.StoryGenre sg
                JOIN dbo.vw_PublicStory p ON p.StoryId = sg.StoryId ORDER BY sg.StoryId""");
        int genreId = ((Number) s.get("GenreId")).intValue();
        long before = expectedGenreCounts().get(genreId);

        hideStory(((Number) s.get("StoryId")).intValue());

        JsonNode genres = ok("/api/genres");
        genres.forEach(g -> {
            if (g.get("genreId").asInt() == genreId) {
                assertThat(g.get("storyCount").asLong()).isEqualTo(before - 1);
            }
        });
    }

    @Test
    void genresAreCachedWithTheirTtl() throws Exception {
        ok("/api/genres");
        long ttl = ttlProperties.genre().toSeconds();
        assertThat(redis.hasKey(CacheKeys.GENRE_LIST)).isTrue();
        assertThat(redis.getExpire(CacheKeys.GENRE_LIST)).isBetween(ttl - 30, ttl);
    }

    @Test
    void genresPathWithoutTrailingSegmentIsPublic() throws Exception {
        // SecurityConfig lists /api/genres/** ; the bare path must match it too
        call("/api/genres").andExpect(status().isOk());
    }

    @Test
    void tagsMatchByNamePrefixOrSlugPrefix() throws Exception {
        Map<String, Object> tag = row("SELECT TOP (1) Name, Slug FROM dbo.Tag WHERE Slug LIKE '%-%' ORDER BY UsageCount DESC");
        String name = (String) tag.get("Name");
        String slug = (String) tag.get("Slug");

        JsonNode byName = ok("/api/tags", "q", name.substring(0, 3), "limit", "50");
        JsonNode bySlugWords = ok("/api/tags", "q", slug.replace('-', ' '), "limit", "50");

        assertThat(byName.findValuesAsText("slug")).contains(slug);
        assertThat(bySlugWords.findValuesAsText("slug")).contains(slug);   // typed without diacritics
    }

    @Test
    void tagsAreOrderedByUsage() throws Exception {
        JsonNode tags = ok("/api/tags", "limit", "50");
        List<Integer> usage = new ArrayList<>();
        tags.forEach(t -> usage.add(t.get("usageCount").asInt()));
        assertThat(usage).isSortedAccordingTo((a, b) -> Integer.compare(b, a));
        assertThat(tags.size()).isEqualTo((int) Math.min(50, count("SELECT COUNT(*) FROM dbo.Tag")));
    }

    @Test
    void likeWildcardsInTheQueryAreLiteral() throws Exception {
        assertThat(ok("/api/tags", "q", "%").size()).isZero();
        assertThat(ok("/api/tags", "q", "_").size()).isZero();
        assertThat(ok("/api/tags", "q", "[a-z]").size()).isZero();
    }

    @Test
    void tagLimitsAreValidated() throws Exception {
        assertThat(ok("/api/tags", "limit", "1").size()).isEqualTo(1);
        call("/api/tags", "limit", "0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[0].field").value("limit"));
        call("/api/tags", "limit", "51").andExpect(status().isBadRequest());
        call("/api/tags", "limit", "abc").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].message").value("has an invalid value"));
        call("/api/tags", "q", "x".repeat(51)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("q"));
    }
}
