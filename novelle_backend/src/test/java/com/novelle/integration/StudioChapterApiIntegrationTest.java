package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.jobs.ScheduledPublisher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Studio volumes and chapters (M6: V1–V4, C1–C10, D2, D4, D7, D8, RB7, RB9, RB11). */
class StudioChapterApiIntegrationTest extends StudioIntegrationSupport {

    @Autowired private ScheduledPublisher scheduledPublisher;

    private static String chapter(long id) {
        return "/api/studio/chapters/" + id;
    }

    private Map<String, Object> storyStats(int storyId) {
        return row("SELECT ChapterCount, WordCount, LastChapterAt, PublishedAt FROM dbo.Story WHERE StoryId = ?", storyId);
    }

    /* ---------- volumes (V1–V4) ---------- */

    @Test
    void volumesAreNumberedInOrderAndOnlyEmptyOnesCanBeDeleted() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        String volumes = "/api/studio/stories/" + storyId + "/volumes";

        JsonNode v1 = json(a.client().post(volumes, Map.of("title", "Quyển 1")).andExpect(status().isCreated()));
        JsonNode v2 = json(a.client().post(volumes, Map.of("title", "Quyển 2")).andExpect(status().isCreated()));
        assertThat(v1.get("volumeNo").asInt()).isEqualTo(1);
        assertThat(v2.get("volumeNo").asInt()).isEqualTo(2);

        createChapter(a, storyId, "C1", "<p>x</p>", v1.get("volumeId").asInt());
        JsonNode list = json(a.client().get(volumes).andExpect(status().isOk()));
        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("chapterCount").asInt()).isEqualTo(1);
        assertThat(list.get(1).get("chapterCount").asInt()).isZero();

        a.client().patch("/api/studio/volumes/" + v2.get("volumeId").asInt(), Map.of("title", "  Quyển hai "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Quyển hai"));
        a.client().delete("/api/studio/volumes/" + v1.get("volumeId").asInt()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("VOLUME_NOT_EMPTY"));
        a.client().delete("/api/studio/volumes/" + v2.get("volumeId").asInt()).andExpect(status().isNoContent());
        a.client().delete("/api/studio/volumes/" + v2.get("volumeId").asInt()).andExpect(status().isNotFound());
    }

    @Test
    void aChapterCannotUseAVolumeOfAnotherStory() throws Exception {
        Author a = author();
        int storyA = createStory(a).get("storyId").asInt();
        int storyB = createStory(a).get("storyId").asInt();
        int volumeOfB = json(a.client().post("/api/studio/stories/" + storyB + "/volumes", Map.of("title", "B1"))
                .andExpect(status().isCreated())).get("volumeId").asInt();

        a.client().post("/api/studio/stories/" + storyA + "/chapters",
                Map.of("title", "x", "content", "<p>x</p>", "volumeId", volumeOfB))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VOLUME_NOT_IN_STORY"));

        JsonNode c = createChapter(a, storyA, "<p>x</p>");
        a.client().put(chapter(c.get("chapterId").asLong()),
                saveBody("x", "<p>y</p>", volumeOfB, c.get("version").asText()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VOLUME_NOT_IN_STORY"));
    }

    /* ---------- create, list (C1, C2, D7) ---------- */

    @Test
    void chapterNumbersContinueAfterADeletedChapter() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long c1 = createChapter(a, storyId, "<p>a</p>").get("chapterId").asLong();
        long c2 = createChapter(a, storyId, "<p>b</p>").get("chapterId").asLong();
        a.client().delete(chapter(c2)).andExpect(status().isNoContent());

        JsonNode c3 = createChapter(a, storyId, "<p>c</p>");

        assertThat(c3.get("chapterNo").asInt()).isEqualTo(3);
        assertThat(c3.get("status").asText()).isEqualTo("DRAFT");
        JsonNode list = json(a.client().get("/api/studio/stories/" + storyId + "/chapters").andExpect(status().isOk()));
        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("chapterId").asLong()).isEqualTo(c1);
        assertThat(list.get(0).has("content")).isFalse();
    }

    @Test
    void chaptersOfOtherAuthorsAreNotFound() throws Exception {
        Author a = author();
        long other = chapterOfAnotherAuthor(a.authorId());

        a.client().get(chapter(other)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CHAPTER_NOT_FOUND"));
        a.client().put(chapter(other), saveBody("x", "<p>x</p>", null, "2026-01-01T00:00:00Z"))
                .andExpect(status().isNotFound());
        a.client().post(chapter(other) + "/publish", null).andExpect(status().isNotFound());
        a.client().put(chapter(other) + "/draft", Map.of("title", "x", "content", "y")).andExpect(status().isNotFound());
        a.client().get(chapter(other) + "/revisions").andExpect(status().isNotFound());
        a.client().get("/api/studio/stories/" + storyOfAnotherAuthor(a.authorId()) + "/chapters")
                .andExpect(status().isNotFound());
    }

    /* ---------- save (C6, D4, RB10) ---------- */

    @Test
    void saveSanitizesCountsWordsAndKeepsTheOldTextAsRevision() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        JsonNode c = createChapter(a, storyId, "Bản đầu", "<p>một hai</p>", null);
        long id = c.get("chapterId").asLong();

        JsonNode saved = json(a.client().put(chapter(id), saveBody("Bản hai",
                "<p onclick=\"x()\">ba bốn năm</p><script>alert(1)</script>", null, c.get("version").asText()))
                .andExpect(status().isOk()));

        assertThat(saved.get("content").asText()).isEqualTo("<p>ba bốn năm</p>");
        assertThat(saved.get("wordCount").asInt()).isEqualTo(3);
        assertThat(saved.get("version").asText()).isNotEqualTo(c.get("version").asText());
        Map<String, Object> rev = row("SELECT RevisionNo, Title, Content, WordCount, EditedBy FROM dbo.ChapterRevision "
                + "WHERE ChapterId = ?", id);
        assertThat(rev.get("Title")).isEqualTo("Bản đầu");
        assertThat(rev.get("Content")).isEqualTo("<p>một hai</p>");
        assertThat(((Number) rev.get("WordCount")).intValue()).isEqualTo(2);
        assertThat(((Number) rev.get("EditedBy")).intValue()).isEqualTo(a.authorId());
    }

    @Test
    void oldVersionIsRejected() throws Exception {
        Author a = author();
        JsonNode c = createChapter(a, createStory(a).get("storyId").asInt(), "<p>a</p>");
        long id = c.get("chapterId").asLong();
        String v0 = c.get("version").asText();

        a.client().put(chapter(id), saveBody("x", "<p>b</p>", null, v0)).andExpect(status().isOk());
        a.client().put(chapter(id), saveBody("x", "<p>c</p>", null, v0)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_DATA"));
        assertThat(jdbc.queryForObject("SELECT Content FROM dbo.Chapter WHERE ChapterId = ?", String.class, id))
                .isEqualTo("<p>b</p>");
    }

    @Test
    void twelveSavesKeepTheTenNewestRevisions() throws Exception {
        Author a = author();
        JsonNode c = createChapter(a, createStory(a).get("storyId").asInt(), "<p>v0</p>");
        long id = c.get("chapterId").asLong();
        String version = c.get("version").asText();
        for (int i = 1; i <= 12; i++) {
            version = json(a.client().put(chapter(id), saveBody("x", "<p>v" + i + "</p>", null, version))
                    .andExpect(status().isOk())).get("version").asText();
        }

        assertThat(count("SELECT COUNT(*) FROM dbo.ChapterRevision WHERE ChapterId = ?", id)).isEqualTo(10);
        assertThat(count("SELECT MIN(RevisionNo) FROM dbo.ChapterRevision WHERE ChapterId = ?", id)).isEqualTo(3);
        assertThat(count("SELECT MAX(RevisionNo) FROM dbo.ChapterRevision WHERE ChapterId = ?", id)).isEqualTo(12);
    }

    /** D4: sp_FlushViews changes RowVer every minute; the UpdatedAt version must not become stale because of it. */
    @Test
    void viewFlushDoesNotMakeTheVersionStale() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long id = createChapter(a, storyId, "<p>một hai</p>").get("chapterId").asLong();
        JsonNode published = publishChapter(a, id);
        String version = published.get("version").asText();
        String rowVerBefore = rowVersionHex(id);

        flushViews(storyId, id, 7);

        assertThat(rowVersionHex(id)).isNotEqualTo(rowVerBefore);
        assertThat(count("SELECT ViewCount FROM dbo.Chapter WHERE ChapterId = ?", id)).isEqualTo(7);
        JsonNode saved = json(a.client().put(chapter(id), saveBody("Sửa sau khi có lượt xem", "<p>một hai ba</p>",
                null, version)).andExpect(status().isOk()));
        assertThat(saved.get("viewCount").asLong()).isEqualTo(7);
        assertThat(count("SELECT WordCount FROM dbo.Story WHERE StoryId = ?", storyId)).isEqualTo(3);   // recalculated
    }

    /* ---------- publish (C7, RB9, D2) ---------- */

    @Test
    void publishUpdatesTheStoryAndCannotRunTwice() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long id = createChapter(a, storyId, "<p>một hai ba</p>").get("chapterId").asLong();
        long empty = createChapter(a, storyId, "").get("chapterId").asLong();

        JsonNode p = publishChapter(a, id);

        assertThat(p.get("status").asText()).isEqualTo("PUBLISHED");
        Map<String, Object> stats = storyStats(storyId);
        assertThat(((Number) stats.get("ChapterCount")).intValue()).isEqualTo(1);
        assertThat(((Number) stats.get("WordCount")).longValue()).isEqualTo(3);
        assertThat(stats.get("LastChapterAt")).isNotNull();
        assertThat(stats.get("PublishedAt")).isNotNull();
        a.client().post(chapter(id) + "/publish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));
        a.client().post(chapter(empty) + "/publish", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHAPTER_EMPTY"));
    }

    @Test
    void publishingAScheduledChapterEarlyClearsTheSchedule() throws Exception {
        Author a = author();
        long id = createChapter(a, createStory(a).get("storyId").asInt(), "<p>x</p>").get("chapterId").asLong();
        a.client().post(chapter(id) + "/schedule", Map.of("scheduledAt", Instant.now().plus(Duration.ofHours(5))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SCHEDULED"));

        JsonNode p = publishChapter(a, id);

        assertThat(p.has("scheduledAt")).isFalse();
        assertThat(count("SELECT COUNT(*) FROM dbo.Chapter WHERE ChapterId = ? AND ScheduledAt IS NULL", id)).isEqualTo(1);
    }

    @Test
    void publishIsRateLimited() throws Exception {
        Author a = author();
        long missing = 9_000_000_000L;
        for (int i = 0; i < 10; i++) {
            a.client().post(chapter(missing) + "/publish", null).andExpect(status().isNotFound());
        }
        a.client().post(chapter(missing) + "/publish", null).andExpect(status().isTooManyRequests());
    }

    /* ---------- schedule (C8, C9, RB11) ---------- */

    @Test
    void scheduleAndUnschedule() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long id = createChapter(a, storyId, "<p>x</p>").get("chapterId").asLong();
        long empty = createChapter(a, storyId, "").get("chapterId").asLong();
        Instant at = Instant.parse("2027-01-01T13:00:00.123Z");

        a.client().post(chapter(id) + "/schedule", Map.of("scheduledAt", Instant.now().minusSeconds(60)))
                .andExpect(status().isBadRequest());
        a.client().post(chapter(empty) + "/schedule", Map.of("scheduledAt", at)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHAPTER_EMPTY"));
        a.client().post(chapter(id) + "/schedule", Map.of("scheduledAt", at)).andExpect(status().isOk())
                .andExpect(jsonPath("$.scheduledAt").value("2027-01-01T13:00:00.123Z"));

        a.client().post(chapter(id) + "/unschedule", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
        assertThat(count("SELECT COUNT(*) FROM dbo.Chapter WHERE ChapterId = ? AND ScheduledAt IS NULL", id)).isEqualTo(1);
        a.client().post(chapter(id) + "/unschedule", null).andExpect(status().isConflict());

        publishChapter(a, id);
        a.client().post(chapter(id) + "/schedule", Map.of("scheduledAt", at)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHAPTER_ALREADY_PUBLISHED"));
    }

    @Test
    void theJobPublishesDueChaptersAndEvictsTheirStory() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long id = createChapter(a, storyId, "<p>một hai</p>").get("chapterId").asLong();
        a.client().post(chapter(id) + "/schedule", Map.of("scheduledAt", Instant.now().plus(Duration.ofHours(1))))
                .andExpect(status().isOk());
        sql("UPDATE dbo.Chapter SET ScheduledAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE ChapterId = ?", id);
        redis.opsForValue().set("cache:story:" + storyId, "{}");

        assertThat(scheduledPublisher.publishDue()).isPositive();

        Map<String, Object> c = row("SELECT Status, ScheduledAt, PublishedAt FROM dbo.Chapter WHERE ChapterId = ?", id);
        assertThat(c.get("Status")).isEqualTo("PUBLISHED");
        assertThat(c.get("ScheduledAt")).isNull();
        assertThat(c.get("PublishedAt")).isNotNull();
        assertThat(((Number) storyStats(storyId).get("ChapterCount")).intValue()).isEqualTo(1);
        assertThat(redis.hasKey("cache:story:" + storyId)).isFalse();
    }

    /* ---------- delete (C10) ---------- */

    @Test
    void deletingAPublishedChapterUpdatesTheStory() throws Exception {
        Author a = author();
        int storyId = createStory(a).get("storyId").asInt();
        long c1 = createChapter(a, storyId, "<p>một</p>").get("chapterId").asLong();
        long c2 = createChapter(a, storyId, "<p>hai ba</p>").get("chapterId").asLong();
        publishChapter(a, c1);
        publishChapter(a, c2);

        a.client().delete(chapter(c2)).andExpect(status().isNoContent());

        Map<String, Object> stats = storyStats(storyId);
        assertThat(((Number) stats.get("ChapterCount")).intValue()).isEqualTo(1);
        assertThat(((Number) stats.get("WordCount")).longValue()).isEqualTo(1);
        a.client().get(chapter(c2)).andExpect(status().isNotFound());
        a.client().delete(chapter(c2)).andExpect(status().isNotFound());
    }

    /* ---------- drafts (C3, C4, C5, D8) ---------- */

    @Test
    void draftLivesInRedisUntilTheChapterIsSaved() throws Exception {
        Author a = author();
        JsonNode c = createChapter(a, createStory(a).get("storyId").asInt(), "<p>đã lưu</p>");
        long id = c.get("chapterId").asLong();
        String key = "draft:" + a.authorId() + ":" + id;

        a.client().put(chapter(id) + "/draft", Map.of("title", "Nháp", "content", "<p>đang viết</p>"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
        Long ttl = redis.getExpire(key);
        assertThat(ttl).isBetween(Duration.ofDays(7).minusMinutes(1).toSeconds(), Duration.ofDays(7).toSeconds());

        JsonNode got = json(a.client().get(chapter(id)).andExpect(status().isOk()));
        assertThat(got.get("content").asText()).isEqualTo("<p>đã lưu</p>");
        assertThat(got.get("draft").get("content").asText()).isEqualTo("<p>đang viết</p>");
        assertThat(count("SELECT COUNT(*) FROM dbo.Chapter WHERE ChapterId = ? AND Content LIKE N'%đang viết%'", id))
                .isZero();

        a.client().put(chapter(id), saveBody("Nháp", "<p>đang viết</p>", null, got.get("version").asText()))
                .andExpect(status().isOk());
        assertThat(redis.hasKey(key)).isFalse();
        assertThat(json(a.client().get(chapter(id)).andExpect(status().isOk())).has("draft")).isFalse();
    }

    @Test
    void draftCanBeDiscarded() throws Exception {
        Author a = author();
        long id = createChapter(a, createStory(a).get("storyId").asInt(), "<p>x</p>").get("chapterId").asLong();
        a.client().put(chapter(id) + "/draft", Map.of("title", "", "content", "")).andExpect(status().isOk());

        a.client().delete(chapter(id) + "/draft").andExpect(status().isNoContent());

        assertThat(redis.hasKey("draft:" + a.authorId() + ":" + id)).isFalse();
    }
}
