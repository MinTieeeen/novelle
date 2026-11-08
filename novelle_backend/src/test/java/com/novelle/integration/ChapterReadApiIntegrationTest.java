package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.CacheKeys;
import org.junit.jupiter.api.Test;

/** R1 GET /api/chapters/{chapterId}: content, navigation, visibility, cache (module-reading D3). */
class ChapterReadApiIntegrationTest extends ReadingIntegrationSupport {

    private JsonNode readOk(long chapterId) throws Exception {
        return json(read(newClient(), chapterId).andExpect(status().isOk()));
    }

    private void expect404(long chapterId) throws Exception {
        read(newClient(), chapterId).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CHAPTER_NOT_FOUND"));
    }

    @Test
    void readsChapterWithStoryVolumeAndNeighbours() throws Exception {
        Chap c = middleChapter();
        Map<String, Object> expected = row("""
                SELECT c.Title, c.WordCount, c.ViewCount, c.VolumeId, s.Slug, s.Title AS StoryTitle, s.AuthorId,
                       s.AuthorName, v.VolumeNo
                FROM dbo.Chapter c JOIN dbo.vw_PublicStory s ON s.StoryId = c.StoryId
                JOIN dbo.Volume v ON v.VolumeId = c.VolumeId
                WHERE c.ChapterId = ?""", c.id());

        JsonNode r = readOk(c.id());

        assertThat(r.get("chapterId").asLong()).isEqualTo(c.id());
        assertThat(r.get("chapterNo").asInt()).isEqualTo(c.no());
        assertThat(r.get("title").asText()).isEqualTo(expected.get("Title"));
        assertThat(r.get("content").asText()).isNotBlank();
        assertThat(r.get("wordCount").asInt()).isEqualTo(((Number) expected.get("WordCount")).intValue());
        assertThat(r.get("viewCount").asLong()).isEqualTo(((Number) expected.get("ViewCount")).longValue());
        assertThat(r.get("publishedAt").asText()).endsWith("Z");
        assertThat(r.get("story").get("storyId").asInt()).isEqualTo(c.storyId());
        assertThat(r.get("story").get("slug").asText()).isEqualTo(expected.get("Slug"));
        assertThat(r.get("story").get("title").asText()).isEqualTo(expected.get("StoryTitle"));
        assertThat(r.get("story").get("author").get("authorId").asInt())
                .isEqualTo(((Number) expected.get("AuthorId")).intValue());
        assertThat(r.get("story").get("author").get("penName").asText()).isEqualTo(expected.get("AuthorName"));
        assertThat(r.get("volume").get("volumeId").asInt()).isEqualTo(((Number) expected.get("VolumeId")).intValue());
        assertThat(r.get("volume").get("volumeNo").asInt()).isEqualTo(((Number) expected.get("VolumeNo")).intValue());
        assertThat(r.get("prevChapterId").asLong()).isEqualTo(chapterId(c.storyId(), c.no() - 1));
        assertThat(r.get("nextChapterId").asLong()).isEqualTo(chapterId(c.storyId(), c.no() + 1));
        assertThat(r.has("myScrollPercent")).as("guest has no reading position").isFalse();
    }

    @Test
    void neighboursSkipChaptersThatAreNotPublic() throws Exception {
        Chap c = middleChapter();
        setChapterStatus(chapterId(c.storyId(), c.no() + 1), "DRAFT");
        deleteChapter(chapterId(c.storyId(), c.no() - 1));

        JsonNode r = readOk(c.id());

        assertThat(r.get("nextChapterId").asLong()).isEqualTo(chapterId(c.storyId(), c.no() + 2));
        assertThat(r.get("prevChapterId").asLong()).isEqualTo(chapterId(c.storyId(), c.no() - 2));
    }

    @Test
    void firstChapterHasNoPrevAndLastHasNoNext() throws Exception {
        Chap first = firstChapter();
        assertThat(readOk(first.id()).has("prevChapterId")).isFalse();

        Chap c = middleChapter();
        // hide every later chapter: c becomes the last public one
        sql("UPDATE dbo.Chapter SET Status = 'DRAFT' WHERE StoryId = ? AND ChapterNo > ?", c.storyId(), c.no());
        JsonNode r = readOk(c.id());
        assertThat(r.has("nextChapterId")).isFalse();
        assertThat(r.has("prevChapterId")).isTrue();
    }

    @Test
    void chapterWithoutVolumeHasNoVolumeField() throws Exception {
        long id = count("""
                SELECT TOP (1) c.ChapterId FROM dbo.Chapter c JOIN dbo.vw_PublicStory s ON s.StoryId = c.StoryId
                WHERE c.VolumeId IS NULL AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0 ORDER BY c.ChapterId""");

        assertThat(readOk(id).has("volume")).isFalse();
    }

    /* ---------- visibility: 404 even when the content is still cached (D3) ---------- */

    @Test
    void draftChapterIs404EvenWhenCached() throws Exception {
        Chap c = middleChapter();
        readOk(c.id());
        assertThat(redis.hasKey(CacheKeys.chapter(c.id()))).isTrue();

        setChapterStatus(c.id(), "DRAFT");
        expect404(c.id());
    }

    @Test
    void scheduledChapterIs404() throws Exception {
        Chap c = middleChapter();
        readOk(c.id());
        setChapterStatus(c.id(), "SCHEDULED");
        expect404(c.id());
    }

    @Test
    void deletedChapterIs404() throws Exception {
        Chap c = middleChapter();
        readOk(c.id());
        deleteChapter(c.id());
        expect404(c.id());
    }

    @Test
    void chapterOfHiddenStoryIs404() throws Exception {
        Chap c = middleChapter();
        readOk(c.id());
        hideStory(c.storyId());
        expect404(c.id());
    }

    @Test
    void chapterOfDraftOrDeletedStoryIs404() throws Exception {
        Chap c = middleChapter();
        sql("UPDATE dbo.Story SET PublishStatus = 'DRAFT' WHERE StoryId = ?", c.storyId());
        expect404(c.id());

        Chap other = chapterOfAnotherStory(c.storyId());
        deleteStory(other.storyId());
        expect404(other.id());
    }

    @Test
    void unknownIdIs404AndNonNumericIs400() throws Exception {
        expect404(Long.MAX_VALUE);
        newClient().get("/api/chapters/abc").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void notFoundCreatesNoCacheEntryAndCountsNoView() throws Exception {
        Chap c = middleChapter();
        setChapterStatus(c.id(), "DRAFT");

        expect404(c.id());

        assertThat(redis.hasKey(CacheKeys.chapter(c.id()))).isFalse();
        assertThat(viewKeys()).isEmpty();
    }

    /* ---------- cache: content cached, navigation and view count live ---------- */

    @Test
    void contentComesFromCacheButNavigationIsLive() throws Exception {
        Chap c = middleChapter();
        JsonNode first = readOk(c.id());

        Long ttl = redis.getExpire(CacheKeys.chapter(c.id()));
        assertThat(ttl).isPositive().isLessThanOrEqualTo(1800L);

        // WordCount (cached part) and ViewCount (read from SQL every time); Title/Content are not changed here
        // because trg_Chapter_Revision requires SESSION_CONTEXT user_id for them.
        sql("UPDATE dbo.Chapter SET WordCount = WordCount + 1000, ViewCount = ViewCount + 5 WHERE ChapterId = ?", c.id());
        JsonNode second = readOk(c.id());

        assertThat(second.get("wordCount").asInt()).isEqualTo(first.get("wordCount").asInt());
        assertThat(second.get("viewCount").asLong()).isEqualTo(first.get("viewCount").asLong() + 5);

        redis.delete(CacheKeys.chapter(c.id()));
        assertThat(readOk(c.id()).get("wordCount").asInt()).isEqualTo(first.get("wordCount").asInt() + 1000);
    }
}
