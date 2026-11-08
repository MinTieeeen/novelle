package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/**
 * Reading position (RB5): the automatic move when a logged-in reader opens a chapter (D2),
 * R2 PUT and R3 GET /api/reading-progress/{storyId}.
 */
class ReadingProgressApiIntegrationTest extends ReadingIntegrationSupport {

    private record Reader(Client client, int userId) {
    }

    private Reader reader() throws Exception {
        Client client = newClient();
        return new Reader(client, userId(registerReader(client)));
    }

    private static Map<String, Object> body(long chapterId, Object scrollPercent) {
        return Map.of("chapterId", chapterId, "scrollPercent", scrollPercent);
    }

    private Map<String, Object> history(int userId, int storyId) {
        var rows = jdbc.queryForList(
                "SELECT LastChapterId, ScrollPercent FROM dbo.ReadingHistory WHERE UserId = ? AND StoryId = ?",
                userId, storyId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static long lastChapter(Map<String, Object> row) {
        return ((Number) row.get("LastChapterId")).longValue();
    }

    private static BigDecimal scroll(Map<String, Object> row) {
        return (BigDecimal) row.get("ScrollPercent");
    }

    private JsonNode readOk(Client client, long chapterId) throws Exception {
        return json(read(client, chapterId).andExpect(status().isOk()));
    }

    @Test
    void openingAChapterCreatesPositionAtZero() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();

        JsonNode chapter = readOk(r.client(), c.id());

        assertThat(chapter.get("myScrollPercent").decimalValue()).isEqualByComparingTo("0");
        Map<String, Object> row = history(r.userId(), c.storyId());
        assertThat(lastChapter(row)).isEqualTo(c.id());
        assertThat(scroll(row)).isEqualByComparingTo("0");
    }

    @Test
    void savedScrollIsRoundedAndKeptWhenTheSameChapterIsOpenedAgain() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        readOk(r.client(), c.id());

        JsonNode saved = json(r.client().put("/api/reading-progress/" + c.storyId(), body(c.id(), 81.4372))
                .andExpect(status().isOk()));

        assertThat(saved.get("storyId").asInt()).isEqualTo(c.storyId());
        assertThat(saved.get("chapterId").asLong()).isEqualTo(c.id());
        assertThat(saved.get("chapterNo").asInt()).isEqualTo(c.no());
        assertThat(saved.get("chapterTitle").asText()).isNotBlank();
        assertThat(saved.get("scrollPercent").decimalValue()).isEqualByComparingTo("81.44");
        assertThat(saved.get("updatedAt").asText()).endsWith("Z");
        assertThat(scroll(history(r.userId(), c.storyId()))).isEqualByComparingTo("81.44");

        JsonNode again = readOk(r.client(), c.id());
        assertThat(again.get("myScrollPercent").decimalValue()).isEqualByComparingTo("81.44");
        assertThat(scroll(history(r.userId(), c.storyId()))).isEqualByComparingTo("81.44");
    }

    @Test
    void openingAnotherChapterMovesThePositionAndResetsScroll() throws Exception {
        Chap c = middleChapter();
        long next = chapterId(c.storyId(), c.no() + 1);
        Reader r = reader();
        r.client().put("/api/reading-progress/" + c.storyId(), body(c.id(), 50)).andExpect(status().isOk());

        JsonNode chapter = readOk(r.client(), next);

        assertThat(chapter.get("myScrollPercent").decimalValue()).isEqualByComparingTo("0");
        Map<String, Object> row = history(r.userId(), c.storyId());
        assertThat(lastChapter(row)).isEqualTo(next);
        assertThat(scroll(row)).isEqualByComparingTo("0");
    }

    @Test
    void getReturnsThePositionOrNoContent() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        String url = "/api/reading-progress/" + c.storyId();

        r.client().get(url).andExpect(status().isNoContent());

        r.client().put(url, body(c.id(), 12.5)).andExpect(status().isOk());
        r.client().get(url).andExpect(status().isOk())
                .andExpect(jsonPath("$.chapterId").value(c.id()))
                .andExpect(jsonPath("$.scrollPercent").value(12.5));

        deleteChapter(c.id());
        r.client().get(url).andExpect(status().isNoContent());
    }

    @Test
    void chapterOfAnotherStoryIsRejectedAndNothingIsWritten() throws Exception {
        Chap c = middleChapter();
        Chap other = chapterOfAnotherStory(c.storyId());
        Reader r = reader();

        r.client().put("/api/reading-progress/" + c.storyId(), body(other.id(), 10))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CHAPTER_NOT_IN_STORY"));

        assertThat(history(r.userId(), c.storyId())).isNull();
    }

    @Test
    void notPublicStoryOrChapterIs404() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        String url = "/api/reading-progress/" + c.storyId();

        setChapterStatus(c.id(), "DRAFT");
        r.client().put(url, body(c.id(), 10)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CHAPTER_NOT_FOUND"));
        r.client().put("/api/reading-progress/" + c.storyId(), body(Long.MAX_VALUE, 10))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CHAPTER_NOT_FOUND"));

        hideStory(c.storyId());
        r.client().put(url, body(chapterId(c.storyId(), c.no() + 1), 10)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        r.client().get(url).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        assertThat(history(r.userId(), c.storyId())).isNull();
    }

    @Test
    void invalidBodiesAre400() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        String url = "/api/reading-progress/" + c.storyId();

        for (Object bad : new Object[] {101, -1, "100.01"}) {
            r.client().put(url, body(c.id(), bad)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details[0].field").value("scrollPercent"));
        }
        r.client().put(url, Map.of("chapterId", c.id())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("scrollPercent"));
        r.client().put(url, Map.of("scrollPercent", 10)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("chapterId"));
        r.client().put(url, "{not json").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        assertThat(history(r.userId(), c.storyId())).isNull();
    }

    @Test
    void guestIs401AndMissingCsrfIs403() throws Exception {
        Chap c = middleChapter();
        String url = "/api/reading-progress/" + c.storyId();

        Client guest = newClient().csrf();
        guest.put(url, body(c.id(), 10)).andExpect(status().isUnauthorized());
        guest.get(url).andExpect(status().isUnauthorized());

        Reader r = reader();
        r.client().putWithoutCsrf(url, body(c.id(), 10)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void savingIsRateLimitedPerUser() throws Exception {
        Chap c = middleChapter();
        Reader r = reader();
        String url = "/api/reading-progress/" + c.storyId();
        String key = "rl:progress:u" + r.userId();
        try {
            // invalid bodies: the limiter runs before validation, so nothing is written
            for (int i = 0; i < 120; i++) {
                r.client().put(url, Map.of("chapterId", c.id())).andExpect(status().isBadRequest());
            }
            r.client().put(url, Map.of("chapterId", c.id())).andExpect(status().isTooManyRequests())
                    .andExpect(header().exists("Retry-After"))
                    .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
            assertThat(redis.getExpire(key)).isPositive().isLessThanOrEqualTo(60L);
        } finally {
            redis.delete(key);
        }
    }
}
