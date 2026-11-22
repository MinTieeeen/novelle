package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.CacheKeys;
import org.junit.jupiter.api.Test;

/** Ratings and reviews (M4: D1–D4). Story.RatingAvg / RatingCount are recomputed by trg_Rating. */
class RatingApiIntegrationTest extends LibraryIntegrationSupport {

    private static String url(int storyId) {
        return "/api/stories/" + storyId + "/ratings";
    }

    private static Map<String, Object> rating(Object score, String review) {
        Map<String, Object> body = new HashMap<>();
        body.put("score", score);
        if (review != null) {
            body.put("review", review);
        }
        return body;
    }

    private long ratingCount(int storyId) {
        return count("SELECT RatingCount FROM dbo.Story WHERE StoryId = ?", storyId);
    }

    /** Same formula as trg_Rating. */
    private BigDecimal expectedAvg(int storyId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(CAST(AVG(CAST(Score AS DECIMAL(5,2))) AS DECIMAL(3,2)), 0)
                FROM dbo.Rating WHERE StoryId = ?""", BigDecimal.class, storyId);
    }

    @Test
    void createThenUpdateKeepsOneRowAndTheAverageMatches() throws Exception {
        int story = publicStoryId();
        long before = ratingCount(story);
        Reader r = reader();

        JsonNode created = json(r.client().put(url(story) + "/me", rating(5, "  Hay lắm. "))
                .andExpect(status().isOk()));
        assertThat(created.get("ratingCount").asLong()).isEqualTo(before + 1);
        assertThat(created.get("ratingAvg").decimalValue()).isEqualByComparingTo(expectedAvg(story));
        assertThat(created.get("rating").get("score").asInt()).isEqualTo(5);
        assertThat(created.get("rating").get("review").asText()).isEqualTo("Hay lắm.");
        assertThat(created.get("rating").get("user").get("username").asText()).isEqualTo(r.username());

        JsonNode updated = json(r.client().put(url(story) + "/me", rating(2, null)).andExpect(status().isOk()));
        assertThat(updated.get("ratingCount").asLong()).isEqualTo(before + 1);
        assertThat(updated.get("ratingAvg").decimalValue()).isEqualByComparingTo(expectedAvg(story));
        assertThat(updated.get("rating").has("review")).isFalse();
        assertThat(count("SELECT COUNT(*) FROM dbo.Rating WHERE UserId = ? AND StoryId = ?", r.userId(), story))
                .isEqualTo(1);
        assertThat(count("SELECT Score FROM dbo.Rating WHERE UserId = ? AND StoryId = ?", r.userId(), story))
                .isEqualTo(2);
    }

    @Test
    void myRatingIs204UntilIRate() throws Exception {
        int story = publicStoryId();
        Reader r = reader();

        r.client().get(url(story) + "/me").andExpect(status().isNoContent());
        r.client().put(url(story) + "/me", rating(4, null)).andExpect(status().isOk());
        r.client().get(url(story) + "/me").andExpect(status().isOk()).andExpect(jsonPath("$.score").value(4));
    }

    @Test
    void deleteIsIdempotentAndUpdatesTheCount() throws Exception {
        int story = publicStoryId();
        long before = ratingCount(story);
        Reader r = reader();
        r.client().put(url(story) + "/me", rating(1, null)).andExpect(status().isOk());

        r.client().delete(url(story) + "/me").andExpect(status().isNoContent());
        r.client().delete(url(story) + "/me").andExpect(status().isNoContent());

        assertThat(ratingCount(story)).isEqualTo(before);
        assertThat(count("SELECT RatingAvg * 100 FROM dbo.Story WHERE StoryId = ?", story))
                .isEqualTo(expectedAvg(story).movePointRight(2).longValue());
    }

    @Test
    void ratingEvictsTheCachedStoryDetail() throws Exception {
        int story = publicStoryId();
        call("/api/stories/" + slugOf(story)).andExpect(status().isOk());
        assertThat(redis.hasKey(CacheKeys.story(story))).isTrue();

        reader().client().put(url(story) + "/me", rating(3, null)).andExpect(status().isOk());

        assertThat(redis.hasKey(CacheKeys.story(story))).isFalse();
        assertThat(ok("/api/stories/" + slugOf(story)).get("ratingCount").asLong()).isEqualTo(ratingCount(story));
    }

    @Test
    void authorCannotRateOwnStoryButAdminsNeverRate() throws Exception {
        AuthorWithStory a = authorWithPublicStory();
        a.client().put(url(a.storyId()) + "/me", rating(5, null)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CANNOT_RATE_OWN_STORY"));

        Client admin = loginAs(seededActiveAdmin());
        admin.put(url(a.storyId()) + "/me", rating(5, null)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ADMIN_CANNOT_RATE"));
        admin.delete(url(a.storyId()) + "/me").andExpect(status().isForbidden());
        admin.get(url(a.storyId()) + "/me").andExpect(status().isNoContent());
    }

    @Test
    void hiddenStoryCannotBeRated() throws Exception {
        int story = publicStoryId();
        hideStory(story);
        Reader r = reader();

        r.client().put(url(story) + "/me", rating(5, null)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        call(url(story)).andExpect(status().isNotFound());
    }

    @Test
    void listHasTheFullDistributionAndFiltersReviews() throws Exception {
        int story = (int) count("""
                SELECT TOP (1) s.StoryId FROM dbo.vw_PublicStory s
                WHERE EXISTS (SELECT 1 FROM dbo.Rating r WHERE r.StoryId = s.StoryId AND r.Review IS NOT NULL)
                  AND EXISTS (SELECT 1 FROM dbo.Rating r WHERE r.StoryId = s.StoryId AND r.Review IS NULL)
                ORDER BY s.StoryId""");

        JsonNode all = ok(url(story), "size", "50");
        assertThat(all.get("ratingCount").asLong()).isEqualTo(ratingCount(story));
        long sum = 0;
        for (int score = 1; score <= 5; score++) {
            long expected = count("SELECT COUNT(*) FROM dbo.Rating WHERE StoryId = ? AND Score = ?", story, score);
            assertThat(all.get("distribution").get(String.valueOf(score)).asLong()).isEqualTo(expected);
            sum += expected;
        }
        assertThat(sum).isEqualTo(all.get("ratingCount").asLong());
        assertThat(all.get("reviews").get("totalElements").asLong()).isEqualTo(sum);

        JsonNode withText = ok(url(story), "hasReview", "true", "size", "50");
        assertThat(withText.get("reviews").get("totalElements").asLong())
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.Rating WHERE StoryId = ? AND Review IS NOT NULL", story))
                .isLessThan(sum);
        withText.get("reviews").get("items").forEach(i -> assertThat(i.get("review").asText()).isNotBlank());
    }

    @Test
    void validation() throws Exception {
        int story = publicStoryId();
        Reader r = reader();
        r.client().put(url(story) + "/me", rating(0, null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("score"));
        r.client().put(url(story) + "/me", rating(6, null)).andExpect(status().isBadRequest());
        r.client().put(url(story) + "/me", Map.of()).andExpect(status().isBadRequest());
        r.client().put(url(story) + "/me", rating(5, "x".repeat(1001))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("review"));
        call(url(story), "hasReview", "maybe").andExpect(status().isBadRequest());
        assertThat(count("SELECT COUNT(*) FROM dbo.Rating WHERE UserId = ?", r.userId())).isZero();
    }

    @Test
    void loginAndCsrfAreRequired() throws Exception {
        int story = publicStoryId();
        call(url(story) + "/me").andExpect(status().isUnauthorized());
        call(url(story)).andExpect(status().isOk());
        reader().client().putWithoutCsrf(url(story) + "/me", rating(5, null)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void ratingIsRateLimitedPerUser() throws Exception {
        int story = publicStoryId();
        Reader r = reader();
        for (int i = 0; i < 10; i++) {
            r.client().put(url(story) + "/me", rating(0, null)).andExpect(status().isBadRequest());
        }
        r.client().put(url(story) + "/me", rating(0, null)).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        assertThat(redis.getExpire("rl:rating:u" + r.userId())).isPositive().isLessThanOrEqualTo(60L);
    }
}
