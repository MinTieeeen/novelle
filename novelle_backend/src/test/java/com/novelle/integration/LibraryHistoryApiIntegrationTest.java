package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Reading history of the library (M4: H1, H2). The position is written by opening a chapter (M3). */
class LibraryHistoryApiIntegrationTest extends LibraryIntegrationSupport {

    @Test
    void openingAChapterAddsItToMyHistory() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        read(r.client(), c.id()).andExpect(status().isOk());

        JsonNode page = json(r.client().get("/api/library/history").andExpect(status().isOk()));

        assertThat(page.get("totalElements").asInt()).isEqualTo(1);
        JsonNode item = page.get("items").get(0);
        assertThat(item.get("story").get("storyId").asInt()).isEqualTo(c.storyId());
        assertThat(item.get("story").get("slug").asText()).isNotBlank();
        assertThat(item.get("lastChapter").get("chapterId").asLong()).isEqualTo(c.id());
        assertThat(item.get("lastChapter").get("chapterNo").asInt()).isEqualTo(c.no());
        assertThat(item.get("scrollPercent").decimalValue()).isEqualByComparingTo("0");
        assertThat(item.get("updatedAt").asText()).endsWith("Z");
    }

    @Test
    void mostRecentlyReadComesFirst() throws Exception {
        Chap a = middleChapter();
        Chap b = chapterOfAnotherStory(a.storyId());
        Reader r = reader();
        read(r.client(), a.id()).andExpect(status().isOk());
        read(r.client(), b.id()).andExpect(status().isOk());
        sql("UPDATE dbo.ReadingHistory SET UpdatedAt = DATEADD(MINUTE, -5, UpdatedAt) WHERE UserId = ? AND StoryId = ?",
                r.userId(), a.storyId());

        JsonNode items = json(r.client().get("/api/library/history").andExpect(status().isOk())).get("items");

        assertThat(items.get(0).get("story").get("storyId").asInt()).isEqualTo(b.storyId());
        assertThat(items.get(1).get("story").get("storyId").asInt()).isEqualTo(a.storyId());
    }

    @Test
    void hiddenStoriesDisappearAndUnpublishedChaptersLoseTheirLink() throws Exception {
        Chap a = middleChapter();
        Chap b = chapterOfAnotherStory(a.storyId());
        Reader r = reader();
        read(r.client(), a.id()).andExpect(status().isOk());
        read(r.client(), b.id()).andExpect(status().isOk());

        hideStory(b.storyId());
        setChapterStatus(a.id(), "DRAFT");

        JsonNode page = json(r.client().get("/api/library/history").andExpect(status().isOk()));
        assertThat(page.get("totalElements").asInt()).isEqualTo(1);
        JsonNode item = page.get("items").get(0);
        assertThat(item.get("story").get("storyId").asInt()).isEqualTo(a.storyId());
        assertThat(item.has("lastChapter")).isFalse();
    }

    @Test
    void deleteIsIdempotentAndWorksForHiddenStories() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        read(r.client(), c.id()).andExpect(status().isOk());
        hideStory(c.storyId());

        r.client().delete("/api/library/history/" + c.storyId()).andExpect(status().isNoContent());
        r.client().delete("/api/library/history/" + c.storyId()).andExpect(status().isNoContent());

        assertThat(count("SELECT COUNT(*) FROM dbo.ReadingHistory WHERE UserId = ?", r.userId())).isZero();
    }

    @Test
    void pagingValidationLoginAndCsrf() throws Exception {
        Reader r = reader();
        r.client().get("/api/library/history?size=0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("size"));
        r.client().get("/api/library/history").andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
        call("/api/library/history").andExpect(status().isUnauthorized());
        r.client().deleteWithoutCsrf("/api/library/history/1").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }
}
