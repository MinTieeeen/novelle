package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Author dashboard (M6: D1–D4). Every number is compared with a query computed by hand. */
class StudioDashboardApiIntegrationTest extends StudioIntegrationSupport {

    private static final String DASH = "/api/studio/dashboard";

    @Test
    void overviewMatchesTheView() throws Exception {
        Author a = author();
        Map<String, Object> v = row("SELECT * FROM dbo.vw_AuthorStats WHERE AuthorId = ?", a.authorId());

        JsonNode o = json(a.client().get(DASH).andExpect(status().isOk()));

        assertThat(o.get("storyCount").asLong()).isEqualTo(((Number) v.get("StoryCount")).longValue());
        assertThat(o.get("publishedStoryCount").asLong()).isEqualTo(((Number) v.get("PublishedStoryCount")).longValue());
        assertThat(o.get("chapterCount").asLong()).isEqualTo(((Number) v.get("ChapterCount")).longValue());
        assertThat(o.get("viewCount").asLong()).isEqualTo(((Number) v.get("ViewCount")).longValue());
        assertThat(o.get("followerCount").asLong()).isEqualTo(((Number) v.get("FollowerCount")).longValue());
        assertThat(o.get("ratingAvg").decimalValue()).isEqualByComparingTo((BigDecimal) v.get("RatingAvg"));
    }

    @Test
    void viewsOfOneStoryIncludeTodaysFlush() throws Exception {
        Author a = author();
        int storyId = publicStoryOf(a);
        flushViews(storyId, null, 5);

        JsonNode r = json(a.client().get(DASH + "/views?storyId=" + storyId).andExpect(status().isOk()));

        assertThat(r.get("granularity").asText()).isEqualTo("day");
        assertThat(r.get("points")).hasSize(30);
        JsonNode last = r.get("points").get(29);
        assertThat(last.get("date").asText()).isEqualTo(LocalDate.now(VN).toString());
        assertThat(last.get("views").asLong()).isEqualTo(5);
        assertThat(r.get("total").asLong()).isEqualTo(5);
    }

    @Test
    void viewsOfAllMyStoriesMatchAHandAggregate() throws Exception {
        Author a = author();
        LocalDate to = LocalDate.now(VN);
        LocalDate from = to.minusMonths(11).withDayOfMonth(1);
        long expected = count("""
                SELECT COALESCE(SUM(CAST(d.Views AS BIGINT)), 0)
                FROM dbo.StoryViewDaily d JOIN dbo.Story s ON s.StoryId = d.StoryId
                WHERE s.AuthorId = ? AND s.IsDeleted = 0 AND d.ViewDate BETWEEN ? AND ?""",
                a.authorId(), from, to.withDayOfMonth(to.lengthOfMonth()));

        JsonNode r = json(a.client().get(DASH + "/views?granularity=month").andExpect(status().isOk()));

        assertThat(r.get("points")).hasSize(12);
        assertThat(r.get("from").asText()).isEqualTo(from.toString());
        assertThat(r.get("total").asLong()).isEqualTo(expected);
    }

    @Test
    void viewsRejectBadRangesAndOtherAuthorsStories() throws Exception {
        Author a = author();
        a.client().get(DASH + "/views?from=2026-11-02&to=2026-11-01").andExpect(status().isBadRequest());
        a.client().get(DASH + "/views?from=2020-01-01&to=2026-01-01").andExpect(status().isBadRequest());
        a.client().get(DASH + "/views?granularity=week").andExpect(status().isBadRequest());
        a.client().get(DASH + "/views?from=not-a-date").andExpect(status().isBadRequest());
        a.client().get(DASH + "/views?storyId=" + storyOfAnotherAuthor(a.authorId())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
    }

    @Test
    void storyStatsListEveryStoryAndTheAboveAverageFlag() throws Exception {
        Author a = author();
        Map<Integer, Boolean> expected = new HashMap<>();
        jdbc.queryForList("""
                SELECT s.StoryId,
                       CASE WHEN s.RatingCount > 0 AND s.RatingAvg >
                            (SELECT AVG(RatingAvg) FROM dbo.Story WHERE AuthorId = ? AND IsDeleted = 0 AND RatingCount > 0)
                            THEN 1 ELSE 0 END AS Above
                FROM dbo.Story s WHERE s.AuthorId = ? AND s.IsDeleted = 0""", a.authorId(), a.authorId())
                .forEach(r -> expected.put(((Number) r.get("StoryId")).intValue(), ((Number) r.get("Above")).intValue() == 1));

        JsonNode list = json(a.client().get(DASH + "/stories").andExpect(status().isOk()));

        assertThat(list).hasSize(expected.size());
        list.forEach(s -> assertThat(s.get("aboveMyAverage").asBoolean())
                .as("story %s", s.get("storyId")).isEqualTo(expected.get(s.get("storyId").asInt())));
        for (int i = 1; i < list.size(); i++) {
            assertThat(list.get(i - 1).get("viewCount").asLong()).isGreaterThanOrEqualTo(list.get(i).get("viewCount").asLong());
        }
    }

    @Test
    void followersMatchTheAuthorRow() throws Exception {
        Author a = author();
        long followers = count("SELECT FollowerCount FROM dbo.Author WHERE UserId = ?", a.authorId());
        long newOnes = count("SELECT COUNT(*) FROM dbo.AuthorFollow WHERE AuthorId = ? "
                + "AND CreatedAt >= DATEADD(DAY, -30, SYSUTCDATETIME())", a.authorId());

        JsonNode f = json(a.client().get(DASH + "/followers").andExpect(status().isOk()));

        assertThat(f.get("followerCount").asLong()).isEqualTo(followers);
        assertThat(f.get("newFollowers30d").asLong()).isEqualTo(newOnes);
        assertThat(f.get("recent").size()).isEqualTo((int) Math.min(20, followers));
        assertThat(f.get("topStories").size()).isLessThanOrEqualTo(10);
    }

    @Test
    void readersCannotSeeADashboard() throws Exception {
        reader().client().get(DASH).andExpect(status().isForbidden());
    }
}
