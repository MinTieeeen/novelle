package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Content moderation (M7: C1–C5, D3, RB8, NFR-M7-06). */
class AdminStoryApiIntegrationTest extends AdminIntegrationSupport {

    private static final String STORIES = ADMIN + "/stories";

    @Test
    void hiddenStoryDisappearsAtOnceAndTheAuthorCannotRepublishIt() throws Exception {
        Admin ad = admin();
        Author a = author();
        int storyId = publicStoryOf(a);
        String slug = slugOf(storyId);
        ok("/api/stories/" + slug);                       // fills cache:story:{id}
        ok("/api/home");                                  // fills cache:home
        assertThat(redis.hasKey("cache:story:" + storyId)).isTrue();

        JsonNode hidden = json(ad.client().post(STORIES + "/" + storyId + "/hide", Map.of("reason", " Vi phạm. "))
                .andExpect(status().isOk()));

        assertThat(hidden.get("publishStatus").asText()).isEqualTo("HIDDEN");
        assertThat(hidden.get("hiddenReason").asText()).isEqualTo("Vi phạm.");
        assertThat(redis.hasKey("cache:story:" + storyId)).isFalse();
        assertThat(redis.hasKey("cache:home")).isFalse();
        call("/api/stories/" + slug).andExpect(status().isNotFound());
        a.client().post("/api/studio/stories/" + storyId + "/unpublish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STORY_HIDDEN"));
        ad.client().post(STORIES + "/" + storyId + "/hide", Map.of("reason", "x")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));

        ad.client().post(STORIES + "/" + storyId + "/unhide", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.publishStatus").value("PUBLISHED"));
        ok("/api/stories/" + slug);
        ad.client().post(STORIES + "/" + storyId + "/unhide", null).andExpect(status().isConflict());
    }

    /** D3. */
    @Test
    void aDraftCannotBeHidden() throws Exception {
        Admin ad = admin();
        int draft = createStory(author()).get("storyId").asInt();

        ad.client().post(STORIES + "/" + draft + "/hide", Map.of("reason", "x")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        ad.client().post(STORIES + "/" + draft + "/hide", Map.of()).andExpect(status().isBadRequest());
        ad.client().post(STORIES + "/999999999/hide", Map.of("reason", "x")).andExpect(status().isNotFound());
    }

    @Test
    void listShowsDraftsOfEveryAuthorWithFilters() throws Exception {
        Admin ad = admin();
        Author a = author();
        String title = uniqueTitle();
        int draft = createStory(a, title).get("storyId").asInt();

        JsonNode page = json(ad.client().get(STORIES + "?publishStatus=draft&authorId=" + a.authorId() + "&size=50")
                .andExpect(status().isOk()));
        assertThat(storyIds(page.get("items"))).contains(draft);
        page.get("items").forEach(s -> assertThat(s.get("author").get("authorId").asInt()).isEqualTo(a.authorId()));

        JsonNode byTitle = json(ad.client().get(STORIES + "?q=" + title.substring(10)).andExpect(status().isOk()));
        assertThat(storyIds(byTitle.get("items"))).containsExactly(draft);
        assertThat(count("SELECT COUNT(*) FROM dbo.Story WHERE IsDeleted = 0"))
                .isEqualTo(json(ad.client().get(STORIES).andExpect(status().isOk())).get("totalElements").asLong());
    }

    @Test
    void anyStoryCanBeSoftDeleted() throws Exception {
        Admin ad = admin();
        int storyId = publicStoryOf(author());
        String slug = slugOf(storyId);

        ad.client().delete(STORIES + "/" + storyId).andExpect(status().isNoContent());

        assertThat(count("SELECT IsDeleted FROM dbo.Story WHERE StoryId = ?", storyId)).isEqualTo(1);
        call("/api/stories/" + slug).andExpect(status().isNotFound());
        ad.client().delete(STORIES + "/" + storyId).andExpect(status().isNotFound());
    }

    @Test
    void deletingAReviewRecomputesTheStoryRating() throws Exception {
        Admin ad = admin();
        int story = publicStoryId();
        Reader r = reader();
        r.client().put("/api/stories/" + story + "/ratings/me", Map.of("score", 1, "review", "Tệ"))
                .andExpect(status().isOk());

        ad.client().delete(ADMIN + "/ratings/" + story + "/" + r.userId()).andExpect(status().isNoContent());

        assertThat(count("SELECT COUNT(*) FROM dbo.Rating WHERE StoryId = ? AND UserId = ?", story, r.userId())).isZero();
        assertThat(count("SELECT RatingCount FROM dbo.Story WHERE StoryId = ?", story))
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.Rating WHERE StoryId = ?", story));
        BigDecimal avg = jdbc.queryForObject("""
                SELECT COALESCE(CAST(AVG(CAST(Score AS DECIMAL(5,2))) AS DECIMAL(3,2)), 0)
                FROM dbo.Rating WHERE StoryId = ?""", BigDecimal.class, story);
        assertThat(jdbc.queryForObject("SELECT RatingAvg FROM dbo.Story WHERE StoryId = ?", BigDecimal.class, story))
                .isEqualByComparingTo(avg);
        ad.client().delete(ADMIN + "/ratings/" + story + "/" + r.userId()).andExpect(status().isNotFound());
    }

    @Test
    void authorsCannotModerate() throws Exception {
        Author a = author();
        a.client().get(STORIES).andExpect(status().isForbidden());
        a.client().post(STORIES + "/1/hide", Map.of("reason", "x")).andExpect(status().isForbidden());
    }
}
