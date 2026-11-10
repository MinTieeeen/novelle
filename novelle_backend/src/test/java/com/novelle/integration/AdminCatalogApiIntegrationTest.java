package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Genres and tags (M7: G1–G4, T1–T3, D4, D5). */
class AdminCatalogApiIntegrationTest extends AdminIntegrationSupport {

    private static final String GENRES = ADMIN + "/genres";
    private static final String TAGS = ADMIN + "/tags";

    @Test
    void genreLifecycleKeepsTheSlugAndEvictsThePublicList() throws Exception {
        Admin ad = admin();
        String suffix = uniqueUsername().substring(3, 9);
        ok("/api/genres");                                 // fills cache:genre:list
        assertThat(redis.hasKey("cache:genre:list")).isTrue();

        JsonNode g = json(ad.client().post(GENRES, Map.of("name", "  IT Thể   loại " + suffix, "sortOrder", 99))
                .andExpect(status().isCreated()));
        int id = g.get("genreId").asInt();
        assertThat(g.get("name").asText()).isEqualTo("IT Thể loại " + suffix);
        assertThat(g.get("slug").asText()).isEqualTo("it-the-loai-" + suffix);
        assertThat(g.get("storyCount").asInt()).isZero();
        assertThat(redis.hasKey("cache:genre:list")).isFalse();
        assertThat(ok("/api/genres").findValuesAsText("slug")).contains("it-the-loai-" + suffix);

        JsonNode renamed = json(ad.client().patch(GENRES + "/" + id, Map.of("name", "IT Đổi " + suffix, "description", "Mô tả"))
                .andExpect(status().isOk()));
        assertThat(renamed.get("slug").asText()).isEqualTo("it-the-loai-" + suffix);
        assertThat(renamed.get("description").asText()).isEqualTo("Mô tả");

        ad.client().delete(GENRES + "/" + id).andExpect(status().isNoContent());
        assertThat(ok("/api/genres").findValuesAsText("slug")).doesNotContain("it-the-loai-" + suffix);
        ad.client().delete(GENRES + "/" + id).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("GENRE_NOT_FOUND"));
    }

    @Test
    void duplicateOrUsedGenresAreRejected() throws Exception {
        Admin ad = admin();
        Map<String, Object> used = row("SELECT TOP (1) g.GenreId, g.Name FROM dbo.Genre g "
                + "WHERE EXISTS (SELECT 1 FROM dbo.StoryGenre sg WHERE sg.GenreId = g.GenreId) ORDER BY g.GenreId");
        int usedId = ((Number) used.get("GenreId")).intValue();
        String usedName = (String) used.get("Name");

        ad.client().post(GENRES, Map.of("name", usedName.toUpperCase())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GENRE_NAME_TAKEN"));
        ad.client().delete(GENRES + "/" + usedId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GENRE_IN_USE"));
        ad.client().post(GENRES, Map.of("name", "!!!")).andExpect(status().isBadRequest());
        ad.client().patch(GENRES + "/" + usedId, Map.of()).andExpect(status().isBadRequest());

        JsonNode list = json(ad.client().get(GENRES).andExpect(status().isOk()));
        JsonNode row = null;
        for (JsonNode n : list) {
            if (n.get("genreId").asInt() == usedId) {
                row = n;
            }
        }
        assertThat(row).isNotNull();
        assertThat(row.get("storyCount").asLong()).isEqualTo(count("""
                SELECT COUNT(*) FROM dbo.StoryGenre sg JOIN dbo.Story s ON s.StoryId = sg.StoryId
                WHERE sg.GenreId = ? AND s.IsDeleted = 0""", usedId));
    }

    @Test
    void tagRenameAndDeleteFollowTheStories() throws Exception {
        Admin ad = admin();
        Author a = author();
        String title = uniqueTitle();
        int storyId = createStory(a, title).get("storyId").asInt();     // tags "Hệ thống" + "IT tag <suffix>"
        int tagId = (int) count("SELECT t.TagId FROM dbo.Tag t JOIN dbo.StoryTag st ON st.TagId = t.TagId "
                + "WHERE st.StoryId = ? AND t.Name LIKE N'IT tag%'", storyId);
        redis.opsForValue().set("cache:story:" + storyId, "{}");

        String newName = "IT đổi " + title.substring(title.length() - 6);
        JsonNode renamed = json(ad.client().patch(TAGS + "/" + tagId, Map.of("name", "  " + newName + " "))
                .andExpect(status().isOk()));
        assertThat(renamed.get("name").asText()).isEqualTo(newName);
        assertThat(renamed.get("slug").asText()).isEqualTo("it-doi-" + title.substring(title.length() - 6).toLowerCase());
        assertThat(redis.hasKey("cache:story:" + storyId)).isFalse();
        ad.client().patch(TAGS + "/" + tagId, Map.of("name", "Hệ thống")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TAG_NAME_TAKEN"));

        JsonNode found = json(ad.client().get(TAGS + "?q=" + newName).andExpect(status().isOk()));
        assertThat(found.get("items").findValuesAsText("name")).containsExactly(newName);

        ad.client().delete(TAGS + "/" + tagId).andExpect(status().isNoContent());
        assertThat(count("SELECT COUNT(*) FROM dbo.StoryTag WHERE TagId = ?", tagId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM dbo.Tag WHERE TagId = ?", tagId)).isZero();
        JsonNode story = json(a.client().get("/api/studio/stories/" + storyId).andExpect(status().isOk()));
        assertThat(story.get("tags").findValuesAsText("name")).doesNotContain(newName);
        ad.client().delete(TAGS + "/" + tagId).andExpect(status().isNotFound());
    }
}
