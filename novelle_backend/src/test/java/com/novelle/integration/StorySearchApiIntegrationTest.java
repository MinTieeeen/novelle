package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assumptions.assumeThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.ratelimit.RateLimitProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * S1 GET /api/stories. Full-text only sees committed rows (and is populated asynchronously), so every text
 * search uses seeded stories; a fixture change can only remove a story from the results (through the view).
 */
class StorySearchApiIntegrationTest extends CatalogIntegrationSupport {

    @Autowired
    private RateLimitProperties rateLimits;

    private JsonNode search(String... params) throws Exception {
        return ok("/api/stories", params);
    }

    private Map<String, Object> mostViewedPublicStory() {
        return row("SELECT TOP (1) StoryId, Title, Description FROM dbo.vw_PublicStory ORDER BY ViewCount DESC");
    }

    /* ---------- full-text ---------- */

    @Test
    void searchWithoutDiacriticsFindsTheStory() throws Exception {
        Map<String, Object> story = mostViewedPublicStory();
        String typed = unaccent((String) story.get("Title")).toLowerCase();

        JsonNode page = search("q", typed, "size", "50");

        assertThat(storyIds(page.get("items"))).contains(((Number) story.get("StoryId")).intValue());
    }

    @Test
    void dTypedForDStrokeMatches() throws Exception {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT TOP (1) StoryId, Title FROM dbo.vw_PublicStory
                WHERE Title LIKE N'%Đ%' COLLATE Latin1_General_100_BIN2 ORDER BY StoryId""");
        assumeThat(rows).as("a seeded title with Đ").isNotEmpty();
        String title = (String) rows.get(0).get("Title");

        JsonNode page = search("q", unaccent(title), "size", "50");

        assertThat(unaccent(title)).doesNotContain("Đ");
        assertThat(storyIds(page.get("items"))).contains(((Number) rows.get(0).get("StoryId")).intValue());
    }

    @Test
    void wordsFromTitleAndDescriptionMatchTogether() throws Exception {
        // regression: one CONTAINSTABLE with "a*" AND "b*" over (Title, Description) needs both words in ONE column
        Map<String, Object> story = mostViewedPublicStory();
        String titleWord = ((String) story.get("Title")).split(" ")[0];
        String titleLower = ((String) story.get("Title")).toLowerCase();
        String descWord = Arrays.stream(((String) story.get("Description")).split("[^\\p{L}]+"))
                .filter(w -> w.length() >= 4 && !titleLower.contains(w.toLowerCase()))
                .findFirst().orElseThrow();

        JsonNode page = search("q", titleWord + " " + descWord, "size", "50");

        assertThat(storyIds(page.get("items"))).contains(((Number) story.get("StoryId")).intValue());
    }

    @Test
    void textSearchSortsByRelevanceAndHonoursOtherSorts() throws Exception {
        Map<String, Object> story = mostViewedPublicStory();
        String word = ((String) story.get("Title")).split(" ")[0];

        JsonNode byViews = search("q", word, "sort", "views", "size", "50");

        List<Long> views = new ArrayList<>();
        byViews.get("items").forEach(n -> views.add(n.get("viewCount").asLong()));
        assertThat(views).isNotEmpty().isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(search("q", word, "size", "50").get("totalElements").asLong())
                .isEqualTo(byViews.get("totalElements").asLong());
    }

    @Test
    void storyThatIsNoLongerPublicDisappearsFromTextResults() throws Exception {
        Map<String, Object> story = mostViewedPublicStory();
        int storyId = ((Number) story.get("StoryId")).intValue();
        String typed = unaccent((String) story.get("Title"));
        sql("UPDATE dbo.Story SET PublishStatus = 'DRAFT' WHERE StoryId = ?", storyId);

        assertThat(storyIds(search("q", typed, "size", "50").get("items"))).doesNotContain(storyId);
    }

    /* ---------- filters ---------- */

    @Test
    void noFilterListsEveryPublicStory() throws Exception {
        JsonNode page = search("size", "5");
        assertThat(page.get("totalElements").asLong()).isEqualTo(count("SELECT COUNT(*) FROM dbo.vw_PublicStory"));
        assertThat(page.get("items").size()).isEqualTo(5);
    }

    @Test
    void singleFiltersMatchAHandWrittenCount() throws Exception {
        assertThat(search("status", "completed").get("totalElements").asLong()).isEqualTo(count(
                "SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND CompletionStatus = 'COMPLETED'"));
        assertThat(search("ageRating", "13+").get("totalElements").asLong()).isEqualTo(count(
                "SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND AgeRating = '13+'"));
        assertThat(search("minChapters", "20", "maxChapters", "30").get("totalElements").asLong()).isEqualTo(count(
                "SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND ChapterCount BETWEEN 20 AND 30"));
        assertThat(search("minRating", "4.5").get("totalElements").asLong()).isEqualTo(count(
                "SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND RatingAvg >= 4.5"));

        search("status", "COMPLETED", "size", "50").get("items")
                .forEach(n -> assertThat(n.get("completionStatus").asText()).isEqualTo("COMPLETED"));
        search("minChapters", "20", "maxChapters", "30", "size", "50").get("items")
                .forEach(n -> assertThat(n.get("chapterCount").asInt()).isBetween(20, 30));
    }

    @Test
    void genreModeAllNeedsEveryGenreAndAnyNeedsOne() throws Exception {
        List<String> slugs = jdbc.queryForList("""
                SELECT TOP (2) g.Slug FROM dbo.StoryGenre sg JOIN dbo.Genre g ON g.GenreId = sg.GenreId
                WHERE sg.StoryId = (SELECT TOP (1) s.StoryId FROM dbo.vw_PublicStory s
                                    WHERE (SELECT COUNT(*) FROM dbo.StoryGenre x WHERE x.StoryId = s.StoryId) >= 2
                                    ORDER BY s.StoryId)
                ORDER BY g.GenreId""", String.class);
        String both = String.join(",", slugs);
        String in = "('" + slugs.get(0) + "','" + slugs.get(1) + "')";   // seeded slugs, [a-z-] only

        long all = search("genres", both).get("totalElements").asLong();
        long any = search("genres", both, "genreMode", "any").get("totalElements").asLong();

        assertThat(all).isPositive().isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.vw_PublicStory s
                WHERE (SELECT COUNT(*) FROM dbo.StoryGenre sg JOIN dbo.Genre g ON g.GenreId = sg.GenreId
                       WHERE sg.StoryId = s.StoryId AND g.Slug IN """ + in + ") = 2"));
        assertThat(any).isGreaterThan(all).isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.vw_PublicStory s
                WHERE EXISTS (SELECT 1 FROM dbo.StoryGenre sg JOIN dbo.Genre g ON g.GenreId = sg.GenreId
                              WHERE sg.StoryId = s.StoryId AND g.Slug IN """ + in + ")"));
        // a repeated slug must not raise the HAVING count
        assertThat(search("genres", slugs.get(0) + "," + slugs.get(0)).get("totalElements").asLong())
                .isEqualTo(search("genres", slugs.get(0)).get("totalElements").asLong());
    }

    @Test
    void tagFilterAndUnknownSlugs() throws Exception {
        Map<String, Object> tag = row("SELECT TOP (1) TagId, Slug FROM dbo.Tag ORDER BY UsageCount DESC");

        assertThat(search("tags", (String) tag.get("Slug")).get("totalElements").asLong()).isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.vw_PublicStory s JOIN dbo.StoryTag st ON st.StoryId = s.StoryId
                WHERE st.TagId = ?""", tag.get("TagId")));
        assertThat(search("genres", "khong-ton-tai").get("totalElements").asLong()).isZero();
        assertThat(search("tags", "khong-ton-tai").get("totalElements").asLong()).isZero();
    }

    @Test
    void combinedFiltersMatchAHandWrittenCount() throws Exception {
        String genre = jdbc.queryForObject("""
                SELECT TOP (1) g.Slug FROM dbo.Genre g JOIN dbo.StoryGenre sg ON sg.GenreId = g.GenreId
                GROUP BY g.Slug ORDER BY COUNT(*) DESC""", String.class);

        long total = search("genres", genre, "status", "ONGOING", "minRating", "3.5", "minChapters", "10")
                .get("totalElements").asLong();

        assertThat(total).isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.Story s
                WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0 AND s.CompletionStatus = 'ONGOING'
                  AND s.RatingAvg >= 3.5 AND s.ChapterCount >= 10
                  AND EXISTS (SELECT 1 FROM dbo.StoryGenre sg JOIN dbo.Genre g ON g.GenreId = sg.GenreId
                              WHERE sg.StoryId = s.StoryId AND g.Slug = ?)""", genre));
    }

    @Test
    void draftHiddenAndDeletedStoriesNeverAppear() throws Exception {
        List<Integer> nonPublic = jdbc.queryForList(
                "SELECT StoryId FROM dbo.Story WHERE PublishStatus <> 'PUBLISHED' OR IsDeleted = 1", Integer.class);
        int deleted = search("sort", "views", "size", "1").get("items").get(0).get("storyId").asInt();
        deleteStory(deleted);

        List<Integer> seen = new ArrayList<>();
        for (int p = 0; ; p++) {
            JsonNode page = search("size", "50", "page", String.valueOf(p));
            seen.addAll(storyIds(page.get("items")));
            if (p + 1 >= page.get("totalPages").asInt()) {
                break;
            }
        }
        assertThat(seen).doesNotContainAnyElementsOf(nonPublic).doesNotContain(deleted).doesNotHaveDuplicates();
    }

    /* ---------- sort and paging ---------- */

    @Test
    void sortsOrderTheResults() throws Exception {
        List<Double> ratings = new ArrayList<>();
        search("sort", "rating", "size", "50").get("items").forEach(n -> ratings.add(n.get("ratingAvg").asDouble()));
        assertThat(ratings).isSortedAccordingTo(Comparator.reverseOrder());

        List<Integer> follows = new ArrayList<>();
        search("sort", "FOLLOWS", "size", "50").get("items").forEach(n -> follows.add(n.get("followCount").asInt()));
        assertThat(follows).isSortedAccordingTo(Comparator.reverseOrder());
    }

    @Test
    void pagesDoNotOverlapAndCountPages() throws Exception {
        JsonNode first = search("size", "5", "page", "0");
        JsonNode second = search("size", "5", "page", "1");
        long total = first.get("totalElements").asLong();

        assertThat(storyIds(first.get("items"))).doesNotContainAnyElementsOf(storyIds(second.get("items")));
        assertThat(first.get("totalPages").asLong()).isEqualTo((total + 4) / 5);

        JsonNode beyond = search("size", "50", "page", "100");
        assertThat(beyond.get("items").size()).isZero();
        assertThat(beyond.get("totalElements").asLong()).isEqualTo(total);
    }

    /* ---------- validation and rate limit ---------- */

    @Test
    void invalidParametersAre400WithTheField() throws Exception {
        String[][] cases = {
                {"sort", "abc", "sort"},
                {"sort", "relevance", "sort"},
                {"q", "!!!", "q"},
                {"q", "x".repeat(101), "q"},
                {"size", "51", "size"},
                {"size", "0", "size"},
                {"page", "-1", "page"},
                {"page", "abc", "page"},
                {"status", "DONE", "status"},
                {"ageRating", "16+", "ageRating"},
                {"genreMode", "both", "genreMode"},
                {"minRating", "6", "minRating"},
                {"minChapters", "-1", "minChapters"},
                {"genres", "a,b,c,d,e,f", "genres"},
        };
        for (String[] c : cases) {
            call("/api/stories", c[0], c[1])
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value(c[2]));
        }
        call("/api/stories", "minChapters", "30", "maxChapters", "10")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("maxChapters"));
        call("/api/stories", "page", "200", "size", "50")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("page"));
    }

    @Test
    void searchIsRateLimitedPerIp() throws Exception {
        RateLimitProperties.Limit limit = rateLimits.limits().get("search");
        Client c = newClient();
        // invalid requests: counted by the interceptor before the controller, and cheap (no SQL)
        for (int i = 0; i < limit.maxRequests(); i++) {
            c.perform(get("/api/stories").param("sort", "abc")).andExpect(status().isBadRequest());
        }
        c.perform(get("/api/stories"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(header().exists("Retry-After"));

        Long ttl = redis.getExpire("rl:search:" + c.ip);
        assertThat(ttl).isPositive().isLessThanOrEqualTo(limit.window().toSeconds());
        // another visitor is not affected
        newClient().perform(get("/api/stories").param("size", "1")).andExpect(status().isOk());
    }
}
