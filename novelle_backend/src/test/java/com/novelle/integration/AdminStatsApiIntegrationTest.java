package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** System statistics (M7: S1–S5, D6). Every number is compared with a query computed by hand. */
class AdminStatsApiIntegrationTest extends AdminIntegrationSupport {

    private static final String STATS = ADMIN + "/stats";

    @Test
    void overviewMatchesHandCounts() throws Exception {
        Admin ad = admin();

        JsonNode o = json(ad.client().get(STATS + "/overview").andExpect(status().isOk()));

        assertThat(o.get("users").get("total").asLong()).isEqualTo(count("SELECT COUNT(*) FROM dbo.[User]"));
        for (String role : List.of("READER", "AUTHOR", "ADMIN")) {
            assertThat(o.get("users").get("byRole").get(role).asLong())
                    .isEqualTo(count("SELECT COUNT(*) FROM dbo.[User] WHERE Role = ?", role));
        }
        assertThat(o.get("users").get("banned").asLong())
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.[User] WHERE Status = 'BANNED'"));
        for (String st : List.of("PUBLISHED", "DRAFT", "HIDDEN")) {
            assertThat(o.get("stories").get("byStatus").get(st).asLong())
                    .isEqualTo(count("SELECT COUNT(*) FROM dbo.Story WHERE IsDeleted = 0 AND PublishStatus = ?", st));
        }
        assertThat(o.get("chapters").get("published").asLong()).isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.Chapter c JOIN dbo.Story s ON s.StoryId = c.StoryId
                WHERE c.IsDeleted = 0 AND s.IsDeleted = 0 AND c.Status = 'PUBLISHED'"""));
        assertThat(o.get("totalViews").asLong())
                .isEqualTo(count("SELECT COALESCE(SUM(ViewCount), 0) FROM dbo.Story WHERE IsDeleted = 0"));
        assertThat(o.get("totalRatings").asLong()).isEqualTo(count("SELECT COUNT(*) FROM dbo.Rating"));
    }

    @Test
    void viewsMatchTheDailyTable() throws Exception {
        Admin ad = admin();
        LocalDate to = LocalDate.now(VN);
        LocalDate from = to.minusDays(29);

        JsonNode r = json(ad.client().get(STATS + "/views").andExpect(status().isOk()));

        assertThat(r.get("points")).hasSize(30);
        assertThat(r.get("from").asText()).isEqualTo(from.toString());
        assertThat(r.get("total").asLong()).isEqualTo(count(
                "SELECT COALESCE(SUM(CAST(Views AS BIGINT)), 0) FROM dbo.StoryViewDaily WHERE ViewDate BETWEEN ? AND ?",
                from, to));
        ad.client().get(STATS + "/views?granularity=week").andExpect(status().isBadRequest());
    }

    @Test
    void genresCountPublicStories() throws Exception {
        Admin ad = admin();

        JsonNode items = json(ad.client().get(STATS + "/genres").andExpect(status().isOk())).get("items");

        assertThat(items.size()).isEqualTo((int) count("SELECT COUNT(*) FROM dbo.Genre"));
        for (JsonNode g : items) {
            Map<String, Object> expected = row("""
                    SELECT COUNT(s.StoryId) AS Cnt, COALESCE(SUM(s.ViewCount), 0) AS Views
                    FROM dbo.StoryGenre sg JOIN dbo.vw_PublicStory s ON s.StoryId = sg.StoryId
                    WHERE sg.GenreId = ?""", g.get("genreId").asInt());
            assertThat(g.get("storyCount").asLong()).isEqualTo(((Number) expected.get("Cnt")).longValue());
            assertThat(g.get("totalViews").asLong()).isEqualTo(((Number) expected.get("Views")).longValue());
        }
    }

    @Test
    void newUsersPerMonthAddUpToTheUsersOfThePeriod() throws Exception {
        Admin ad = admin();
        LocalDate firstMonth = LocalDate.now(VN).withDayOfMonth(1).minusMonths(11);

        JsonNode months = json(ad.client().get(STATS + "/users").andExpect(status().isOk())).get("months");

        assertThat(months).hasSize(12);
        assertThat(months.get(0).get("month").asText()).isEqualTo(firstMonth.toString());
        long sum = 0;
        for (JsonNode m : months) {
            sum += m.get("total").asLong();
        }
        assertThat(sum).isEqualTo(count(
                "SELECT COUNT(*) FROM dbo.[User] WHERE DATEADD(HOUR, 7, CreatedAt) >= ?", firstMonth.atStartOfDay()));
        ad.client().get(STATS + "/users?months=61").andExpect(status().isBadRequest());
    }

    /** Subquery + HAVING: the authors above the average of the per-author view totals. */
    @Test
    void topAuthorsAreAboveTheSystemAverage() throws Exception {
        Admin ad = admin();
        BigDecimal avg = jdbc.queryForObject("""
                SELECT CAST(AVG(CAST(t.Total AS DECIMAL(20,2))) AS DECIMAL(20,2))
                FROM (SELECT SUM(ViewCount) AS Total FROM dbo.Story WHERE IsDeleted = 0 GROUP BY AuthorId) t""",
                BigDecimal.class);
        List<Integer> expected = jdbc.queryForList("""
                SELECT TOP (50) AuthorId FROM dbo.Story WHERE IsDeleted = 0 GROUP BY AuthorId
                HAVING SUM(ViewCount) > ? ORDER BY SUM(ViewCount) DESC, AuthorId""", Integer.class, avg);

        JsonNode r = json(ad.client().get(STATS + "/top-authors?limit=50").andExpect(status().isOk()));

        assertThat(r.get("systemAverageViews").decimalValue()).isEqualByComparingTo(avg);
        List<Integer> ids = new ArrayList<>();
        r.get("items").forEach(a -> {
            ids.add(a.get("authorId").asInt());
            assertThat(a.get("totalViews").decimalValue()).isGreaterThan(avg);
        });
        assertThat(ids).isEqualTo(expected);
    }

    /** D6: the default call is cached and survives the JSON round trip (dates, maps). */
    @Test
    void defaultCallsAreCachedForFiveMinutes() throws Exception {
        Admin ad = admin();
        for (String name : List.of("overview", "views", "genres", "users", "top-authors")) {
            String first = ad.client().get(STATS + "/" + name).andExpect(status().isOk()).andReturn()
                    .getResponse().getContentAsString();
            Long ttl = redis.getExpire("cache:stats:" + name);
            assertThat(ttl).as(name).isBetween(240L, 300L);
            String second = ad.client().get(STATS + "/" + name).andExpect(status().isOk()).andReturn()
                    .getResponse().getContentAsString();
            assertThat(objectMapper.readTree(second)).as(name).isEqualTo(objectMapper.readTree(first));
        }
        ad.client().get(STATS + "/top-authors?limit=3").andExpect(status().isOk());
        assertThat(redis.keys("cache:stats:*")).hasSize(5);
    }

    @Test
    void readersCannotSeeStatistics() throws Exception {
        reader().client().get(STATS + "/overview").andExpect(status().isForbidden());
    }
}
