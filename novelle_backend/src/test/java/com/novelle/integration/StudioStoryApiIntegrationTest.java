package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.html.SlugGenerator;
import org.junit.jupiter.api.Test;

/** Studio stories and author profile (M6: S1–S11, D1, D5, D6, RB1, RB2, RB6). */
class StudioStoryApiIntegrationTest extends StudioIntegrationSupport {

    private static final String STORIES = "/api/studio/stories";

    private static String url(int storyId) {
        return STORIES + "/" + storyId;
    }

    /** RB6 check of 99_check_invariants, for one story. */
    private long rb6Violations(int storyId) {
        return count("""
                SELECT COUNT(*) FROM dbo.Story s
                CROSS APPLY (SELECT COUNT(*) AS GenreCnt, COALESCE(SUM(CAST(g.IsPrimary AS INT)), 0) AS PrimaryCnt
                             FROM dbo.StoryGenre g WHERE g.StoryId = s.StoryId) x
                WHERE s.StoryId = ? AND (x.GenreCnt NOT BETWEEN 1 AND 3 OR x.PrimaryCnt <> 1)""", storyId);
    }

    /** Tag.UsageCount check of 99_check_invariants, for the tags of one story plus {@code extraTagIds}. */
    private long usageViolations(int storyId) {
        return count("""
                SELECT COUNT(*) FROM dbo.Tag t
                WHERE t.TagId IN (SELECT TagId FROM dbo.StoryTag WHERE StoryId = ?)
                  AND t.UsageCount <> (SELECT COUNT(*) FROM dbo.StoryTag st WHERE st.TagId = t.TagId)""", storyId);
    }

    private long usageOf(int tagId) {
        return count("SELECT UsageCount FROM dbo.Tag WHERE TagId = ?", tagId);
    }

    /* ---------- create (S2) ---------- */

    @Test
    void createMakesADraftWithGenresTagsAndSlug() throws Exception {
        Author a = author();
        String title = uniqueTitle();
        List<Integer> genres = genreIds(2);

        JsonNode s = createStory(a, title);

        int storyId = s.get("storyId").asInt();
        assertThat(s.get("publishStatus").asText()).isEqualTo("DRAFT");
        assertThat(s.get("slug").asText()).isEqualTo(new SlugGenerator().slugify(title, 350));
        assertThat(s.get("genres")).hasSize(2);
        assertThat(s.get("genres").get(0).get("genreId").asInt()).isEqualTo(genres.get(1));
        assertThat(s.get("genres").get(0).get("isPrimary").asBoolean()).isTrue();
        assertThat(s.get("tags")).hasSize(2);
        assertThat(s.get("version").asText()).endsWith("Z");
        assertThat(count("SELECT AuthorId FROM dbo.Story WHERE StoryId = ?", storyId)).isEqualTo(a.authorId());
        assertThat(rb6Violations(storyId)).isZero();
        assertThat(usageViolations(storyId)).isZero();
    }

    @Test
    void sameTitleGetsASuffix() throws Exception {
        Author a = author();
        String title = uniqueTitle();
        String first = createStory(a, title).get("slug").asText();
        String second = createStory(a, title).get("slug").asText();
        assertThat(second).isEqualTo(first + "-2");
    }

    @Test
    void invalidBodiesAre400AndWriteNothing() throws Exception {
        Author a = author();
        long before = count("SELECT COUNT(*) FROM dbo.Story WHERE AuthorId = ?", a.authorId());
        List<Integer> g = genreIds(4);
        List<String> elevenTags = new ArrayList<>();
        for (int i = 0; i < 11; i++) {
            elevenTags.add("Tag số " + i);
        }
        List<Map<String, Object>> bodies = new ArrayList<>();
        for (Object[] change : new Object[][] {
                {"genreIds", List.of()}, {"genreIds", g}, {"primaryGenreId", 99999}, {"genreIds", List.of(g.get(0), g.get(0))},
                {"tags", elevenTags}, {"tags", List.of("a")}, {"coverUrl", "https://evil.example/x.jpg"},
                {"title", "  "}, {"ageRating", "21+"}}) {   // 10 requests with the one below: the story-create limit
            Map<String, Object> body = new HashMap<>(storyBody(uniqueTitle()));
            body.put((String) change[0], change[1]);
            bodies.add(body);
        }
        Map<String, Object> unknownGenre = new HashMap<>(storyBody(uniqueTitle()));
        unknownGenre.put("genreIds", List.of(g.get(0), 32000));
        unknownGenre.put("primaryGenreId", g.get(0));
        bodies.add(unknownGenre);

        for (Map<String, Object> body : bodies) {
            a.client().post(STORIES, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }
        assertThat(count("SELECT COUNT(*) FROM dbo.Story WHERE AuthorId = ?", a.authorId())).isEqualTo(before);
    }

    /* ---------- list, get (S1, S3) ---------- */

    @Test
    void listShowsMyDraftsAndFiltersByStatus() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();

        JsonNode drafts = json(a.client().get(STORIES + "?status=draft&size=50").andExpect(status().isOk()));
        assertThat(storyIds(drafts.get("items"))).contains(storyId);
        assertThat(drafts.get("items").get(0).get("storyId").asInt()).isEqualTo(storyId);   // newest change first

        JsonNode published = json(a.client().get(STORIES + "?status=PUBLISHED&size=50").andExpect(status().isOk()));
        assertThat(storyIds(published.get("items"))).doesNotContain(storyId);
        a.client().get(STORIES + "?status=DELETED").andExpect(status().isBadRequest());
    }

    @Test
    void storiesOfOtherAuthorsAreNotFound() throws Exception {
        Author a = author();
        int other = storyOfAnotherAuthor(a.authorId());

        a.client().get(url(other)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        a.client().patch(url(other), Map.of("title", "x", "version", "2026-01-01T00:00:00Z"))
                .andExpect(status().isNotFound());
        a.client().post(url(other) + "/publish", null).andExpect(status().isNotFound());
        a.client().delete(url(other)).andExpect(status().isNotFound());
        assertThat(count("SELECT IsDeleted FROM dbo.Story WHERE StoryId = ?", other)).isZero();
    }

    /* ---------- update (S4, D4) ---------- */

    @Test
    void patchUsesTheVersionAndKeepsTheSlug() throws Exception {
        Author a = author();
        JsonNode s = createStory(a);
        int storyId = s.get("storyId").asInt();
        String v0 = s.get("version").asText();

        JsonNode updated = json(a.client().patch(url(storyId),
                Map.of("title", "  Tên mới  ", "description", "", "completionStatus", "COMPLETED", "version", v0))
                .andExpect(status().isOk()));
        assertThat(updated.get("title").asText()).isEqualTo("Tên mới");
        assertThat(updated.has("description")).isFalse();
        assertThat(updated.get("completionStatus").asText()).isEqualTo("COMPLETED");
        assertThat(updated.get("slug").asText()).isEqualTo(s.get("slug").asText());
        assertThat(updated.get("version").asText()).isNotEqualTo(v0);

        a.client().patch(url(storyId), Map.of("title", "Lần hai", "version", v0))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_DATA"));
        a.client().patch(url(storyId), Map.of("version", updated.get("version").asText()))
                .andExpect(status().isBadRequest());
    }

    /* ---------- genres, tags (S5, S6) ---------- */

    @Test
    void replaceGenresKeepsRb6() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        List<Integer> g = genreIds(3);

        JsonNode s = json(a.client().put(url(storyId) + "/genres", Map.of("genreIds", g, "primaryGenreId", g.get(2)))
                .andExpect(status().isOk()));
        assertThat(s.get("genres")).hasSize(3);
        assertThat(s.get("genres").get(0).get("genreId").asInt()).isEqualTo(g.get(2));
        assertThat(rb6Violations(storyId)).isZero();

        a.client().put(url(storyId) + "/genres", Map.of("genreIds", g, "primaryGenreId", 32000))
                .andExpect(status().isBadRequest());
        assertThat(count("SELECT COUNT(*) FROM dbo.StoryGenre WHERE StoryId = ?", storyId)).isEqualTo(3);
    }

    @Test
    void replaceTagsKeepsUsageCountsExact() throws Exception {
        Author a = author();
        JsonNode s = createStory(a);
        int storyId = s.get("storyId").asInt();
        int seededTag = (int) count("SELECT TOP (1) TagId FROM dbo.Tag WHERE UsageCount > 0 "
                + "AND TagId NOT IN (SELECT TagId FROM dbo.StoryTag WHERE StoryId = ?) ORDER BY TagId", storyId);
        String seededName = jdbc.queryForObject("SELECT Name FROM dbo.Tag WHERE TagId = ?", String.class, seededTag);
        long seededUsage = usageOf(seededTag);
        int oldTag = s.get("tags").get(0).get("tagId").asInt();
        long oldUsage = usageOf(oldTag);

        JsonNode updated = json(a.client().put(url(storyId) + "/tags",
                Map.of("tags", List.of(seededName.toUpperCase(), "Mới tinh " + storyId))).andExpect(status().isOk()));

        assertThat(updated.get("tags")).hasSize(2);
        assertThat(usageOf(seededTag)).isEqualTo(seededUsage + 1);
        assertThat(usageOf(oldTag)).isEqualTo(oldUsage - 1);
        assertThat(usageViolations(storyId)).isZero();

        a.client().put(url(storyId) + "/tags", Map.of("tags", List.of())).andExpect(status().isOk());
        assertThat(usageOf(seededTag)).isEqualTo(seededUsage);
        assertThat(count("SELECT COUNT(*) FROM dbo.StoryTag WHERE StoryId = ?", storyId)).isZero();
    }

    /* ---------- publish, unpublish (S7, S8, D1, D5) ---------- */

    @Test
    void publishingNeedsAPublishedChapterAndMakesTheStoryPublic() throws Exception {
        Author a = author();
        JsonNode s = createStory(a);
        int storyId = s.get("storyId").asInt();
        String slug = s.get("slug").asText();

        a.client().post(url(storyId) + "/publish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STORY_HAS_NO_CHAPTER"));
        long chapterId = createChapter(a, storyId, "<p>một hai ba</p>").get("chapterId").asLong();
        a.client().post(url(storyId) + "/publish", null).andExpect(status().isConflict());

        publishChapter(a, chapterId);
        call("/api/stories/" + slug).andExpect(status().isNotFound());   // chapter public, story still a draft

        JsonNode published = json(a.client().post(url(storyId) + "/publish", null).andExpect(status().isOk()));
        assertThat(published.get("publishStatus").asText()).isEqualTo("PUBLISHED");
        assertThat(published.get("publishedAt")).isNotNull();
        ok("/api/stories/" + slug);
        a.client().post(url(storyId) + "/publish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));

        a.client().post(url(storyId) + "/unpublish", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.publishStatus").value("DRAFT"));
        call("/api/stories/" + slug).andExpect(status().isNotFound());
        a.client().post(url(storyId) + "/unpublish", null).andExpect(status().isConflict());
    }

    @Test
    void hiddenStoryKeepsItsStatusButCanStillBeEdited() throws Exception {
        Author a = author();
        int storyId = publicStoryOf(a);
        hideStory(storyId);

        a.client().post(url(storyId) + "/unpublish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STORY_HIDDEN"));
        a.client().post(url(storyId) + "/publish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STORY_HIDDEN"));
        JsonNode s = json(a.client().get(url(storyId)).andExpect(status().isOk()));
        assertThat(s.get("hiddenReason").asText()).isEqualTo("IT");
        a.client().patch(url(storyId), Map.of("title", "Đã sửa", "version", s.get("version").asText()))
                .andExpect(status().isOk());
    }

    @Test
    void publishEvictsTheCachedStory() throws Exception {
        Author a = author();
        int storyId = publicStoryOf(a);
        redis.opsForValue().set("cache:story:" + storyId, "{}");

        a.client().post(url(storyId) + "/unpublish", null).andExpect(status().isOk());

        assertThat(redis.hasKey("cache:story:" + storyId)).isFalse();
    }

    /* ---------- delete (S9, D6) ---------- */

    @Test
    void deleteHidesTheStoryEverywhereAndKeepsTagUsage() throws Exception {
        Author a = author();
        int storyId = publicStoryOf(a);
        String slug = slugOf(storyId);
        int tagId = (int) count("SELECT TOP (1) TagId FROM dbo.StoryTag WHERE StoryId = ?", storyId);
        long usage = usageOf(tagId);

        a.client().delete(url(storyId)).andExpect(status().isNoContent());

        a.client().get(url(storyId)).andExpect(status().isNotFound());
        call("/api/stories/" + slug).andExpect(status().isNotFound());
        assertThat(count("SELECT IsDeleted FROM dbo.Story WHERE StoryId = ?", storyId)).isEqualTo(1);
        assertThat(usageOf(tagId)).isEqualTo(usage);
        a.client().delete(url(storyId)).andExpect(status().isNotFound());
    }

    /* ---------- profile (S10, S11) ---------- */

    @Test
    void profileCanBeEditedAndPenNamesStayUnique() throws Exception {
        Author a = author();
        JsonNode p = json(a.client().get("/api/studio/profile").andExpect(status().isOk()));
        assertThat(p.get("authorId").asInt()).isEqualTo(a.authorId());

        a.client().patch("/api/studio/profile", Map.of("bio", "  Giới thiệu mới ")).andExpect(status().isOk())
                .andExpect(jsonPath("$.bio").value("Giới thiệu mới"))
                .andExpect(jsonPath("$.penName").value(p.get("penName").asText()));

        String taken = jdbc.queryForObject("SELECT TOP (1) PenName FROM dbo.Author WHERE UserId <> ? ORDER BY UserId",
                String.class, a.authorId());
        a.client().patch("/api/studio/profile", Map.of("penName", taken)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PEN_NAME_TAKEN"));

        String fresh = "IT " + uniqueUsername();
        a.client().patch("/api/studio/profile", Map.of("penName", fresh)).andExpect(status().isOk())
                .andExpect(jsonPath("$.penName").value(fresh));
        a.client().patch("/api/studio/profile", Map.of()).andExpect(status().isBadRequest());
    }

    /* ---------- security, rate limit ---------- */

    @Test
    void onlyAuthorsWithCsrfCanUseTheStudio() throws Exception {
        newClient().get(STORIES).andExpect(status().isUnauthorized());
        reader().client().get(STORIES).andExpect(status().isForbidden());
        loginAs(seededActiveAdmin()).get(STORIES).andExpect(status().isForbidden());

        Author a = author();
        a.client().postWithoutCsrf(STORIES, storyBody(uniqueTitle())).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void storyCreationIsRateLimited() throws Exception {
        Author a = author();
        Map<String, Object> invalid = Map.of("title", "");   // 400 after the limiter counted it
        for (int i = 0; i < 10; i++) {
            a.client().post(STORIES, invalid).andExpect(status().isBadRequest());
        }
        a.client().post(STORIES, storyBody(uniqueTitle())).andExpect(status().isTooManyRequests());
    }
}
