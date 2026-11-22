package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** AU1 GET /api/authors/{id}, AU2 GET /api/authors/{id}/stories. */
class AuthorApiIntegrationTest extends CatalogIntegrationSupport {

    /** An author with public stories and at least one draft or hidden story. */
    private int authorWithPublicAndNonPublicStories() {
        return jdbc.queryForObject("""
                SELECT TOP (1) s.AuthorId FROM dbo.Story s
                GROUP BY s.AuthorId
                HAVING SUM(CASE WHEN s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0 THEN 1 ELSE 0 END) > 0
                   AND SUM(CASE WHEN s.PublishStatus <> 'PUBLISHED' THEN 1 ELSE 0 END) > 0
                ORDER BY s.AuthorId""", Integer.class);
    }

    @Test
    void statisticsCountPublicStoriesOnly() throws Exception {
        int authorId = authorWithPublicAndNonPublicStories();
        // hand-written expectations over the base table (not the view used by the mapper)
        Map<String, Object> expected = row("""
                SELECT COUNT(*) AS Stories, SUM(CAST(ChapterCount AS BIGINT)) AS Chapters,
                       SUM(ViewCount) AS Views, SUM(CAST(RatingCount AS BIGINT)) AS Ratings,
                       SUM(CAST(RatingAvg AS DECIMAL(18,4)) * RatingCount) AS RatingSum
                FROM dbo.Story WHERE AuthorId = ? AND PublishStatus = 'PUBLISHED' AND IsDeleted = 0""", authorId);
        long all = count("SELECT COUNT(*) FROM dbo.Story WHERE AuthorId = ? AND IsDeleted = 0", authorId);

        JsonNode a = ok("/api/authors/" + authorId);
        JsonNode stats = a.get("stats");

        assertThat(a.get("authorId").asInt()).isEqualTo(authorId);
        assertThat(a.has("isVerified")).isTrue();
        assertThat(stats.get("storyCount").asLong()).isEqualTo(((Number) expected.get("Stories")).longValue())
                .isLessThan(all);
        assertThat(stats.get("chapterCount").asLong()).isEqualTo(((Number) expected.get("Chapters")).longValue());
        assertThat(stats.get("viewCount").asLong()).isEqualTo(((Number) expected.get("Views")).longValue());
        long ratings = ((Number) expected.get("Ratings")).longValue();
        assertThat(stats.get("ratingCount").asLong()).isEqualTo(ratings);
        if (ratings > 0) {
            BigDecimal weighted = ((BigDecimal) expected.get("RatingSum"))
                    .divide(BigDecimal.valueOf(ratings), 2, RoundingMode.HALF_UP);   // CAST AS DECIMAL rounds
            assertThat(stats.get("ratingAvg").decimalValue()).isEqualByComparingTo(weighted);
        }
    }

    @Test
    void authorWithoutPublicStoriesHasZeroStatistics() throws Exception {
        int authorId = jdbc.queryForObject("""
                SELECT TOP (1) a.UserId FROM dbo.Author a
                WHERE NOT EXISTS (SELECT 1 FROM dbo.vw_PublicStory p WHERE p.AuthorId = a.UserId)
                ORDER BY a.UserId""", Integer.class);

        JsonNode stats = ok("/api/authors/" + authorId).get("stats");

        assertThat(stats.get("storyCount").asInt()).isZero();
        assertThat(stats.get("viewCount").asLong()).isZero();
        assertThat(stats.get("ratingAvg").decimalValue()).isEqualByComparingTo("0");
    }

    @Test
    void bannedAuthorPageStaysVisible() throws Exception {
        int authorId = authorWithPublicAndNonPublicStories();
        sql("UPDATE dbo.[User] SET Status = 'BANNED', BanReason = N'IT ban', BannedAt = SYSUTCDATETIME() WHERE UserId = ?",
                authorId);

        ok("/api/authors/" + authorId);
        assertThat(ok("/api/authors/" + authorId + "/stories").get("totalElements").asLong()).isPositive();
    }

    @Test
    void unknownOrMalformedAuthor() throws Exception {
        int reader = jdbc.queryForObject(
                "SELECT TOP (1) UserId FROM dbo.[User] WHERE Role = 'READER' ORDER BY UserId", Integer.class);
        call("/api/authors/" + reader).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AUTHOR_NOT_FOUND"));
        call("/api/authors/" + reader + "/stories").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AUTHOR_NOT_FOUND"));
        call("/api/authors/abc").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void storiesOfAnAuthorArePublicOnesSortedAndPaged() throws Exception {
        int authorId = authorWithPublicAndNonPublicStories();
        int hidden = jdbc.queryForObject("""
                SELECT TOP (1) StoryId FROM dbo.vw_PublicStory WHERE AuthorId = ? ORDER BY StoryId""",
                Integer.class, authorId);
        long expected = count("SELECT COUNT(*) FROM dbo.vw_PublicStory WHERE AuthorId = ?", authorId) - 1;
        hideStory(hidden);

        JsonNode page = ok("/api/authors/" + authorId + "/stories", "sort", "views", "size", "50");

        assertThat(page.get("totalElements").asLong()).isEqualTo(expected);
        assertThat(storyIds(page.get("items"))).doesNotContain(hidden).hasSize((int) Math.min(50, expected));
        page.get("items").forEach(s -> assertThat(s.get("author").get("authorId").asInt()).isEqualTo(authorId));
        List<Long> views = new ArrayList<>();
        page.get("items").forEach(s -> views.add(s.get("viewCount").asLong()));
        assertThat(views).isSortedAccordingTo(Comparator.reverseOrder());
    }

    @Test
    void storyListParametersAreValidated() throws Exception {
        int authorId = authorWithPublicAndNonPublicStories();
        call("/api/authors/" + authorId + "/stories", "sort", "relevance").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("sort"));
        call("/api/authors/" + authorId + "/stories", "size", "0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("size"));
        call("/api/authors/" + authorId + "/stories", "page", "x").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("page"));
    }
}
