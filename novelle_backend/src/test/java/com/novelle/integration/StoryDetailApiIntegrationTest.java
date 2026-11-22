package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** S2 GET /api/stories/{slug}. */
class StoryDetailApiIntegrationTest extends CatalogIntegrationSupport {

    @Autowired
    private CacheTtlProperties ttlProperties;

    /** A public story split into volumes. */
    private Map<String, Object> storyWithVolumes() {
        return row("""
                SELECT TOP (1) s.StoryId, s.Slug FROM dbo.vw_PublicStory s
                WHERE EXISTS (SELECT 1 FROM dbo.Volume v WHERE v.StoryId = s.StoryId)
                ORDER BY s.StoryId""");
    }

    private static int id(Map<String, Object> row) {
        return ((Number) row.get("StoryId")).intValue();
    }

    private static String slug(Map<String, Object> row) {
        return (String) row.get("Slug");
    }

    /** chapterIds of the table of contents, volumes first, then the loose chapters. */
    private static List<Long> tocChapterIds(JsonNode detail) {
        List<Long> ids = new ArrayList<>();
        detail.get("volumes").forEach(v -> v.get("chapters").forEach(c -> ids.add(c.get("chapterId").asLong())));
        detail.get("looseChapters").forEach(c -> ids.add(c.get("chapterId").asLong()));
        return ids;
    }

    @Test
    void detailHasHeaderGenresTagsAndToc() throws Exception {
        Map<String, Object> story = storyWithVolumes();
        int storyId = id(story);

        JsonNode d = ok("/api/stories/" + slug(story));

        assertThat(d.get("storyId").asInt()).isEqualTo(storyId);
        assertThat(d.get("author").has("isVerified")).isTrue();
        assertThat(d.get("genres").size()).isEqualTo((int) count("SELECT COUNT(*) FROM dbo.StoryGenre WHERE StoryId = ?", storyId));
        assertThat(d.get("tags").size()).isEqualTo((int) count("SELECT COUNT(*) FROM dbo.StoryTag WHERE StoryId = ?", storyId));
        if (count("SELECT COUNT(*) FROM dbo.StoryGenre WHERE StoryId = ? AND IsPrimary = 1", storyId) == 1) {
            assertThat(d.get("genres").get(0).get("isPrimary").asBoolean()).isTrue();
        }
        assertThat(tocChapterIds(d)).doesNotHaveDuplicates().hasSize((int) count("""
                SELECT COUNT(*) FROM dbo.Chapter WHERE StoryId = ? AND Status = 'PUBLISHED' AND IsDeleted = 0""", storyId));
        assertThat(d.get("volumes").size()).isPositive();
    }

    @Test
    void tocIsOrderedByVolumeThenChapter() throws Exception {
        JsonNode d = ok("/api/stories/" + slug(storyWithVolumes()));

        List<Integer> volumeNos = new ArrayList<>();
        d.get("volumes").forEach(v -> {
            volumeNos.add(v.get("volumeNo").asInt());
            List<Integer> chapterNos = new ArrayList<>();
            v.get("chapters").forEach(c -> chapterNos.add(c.get("chapterNo").asInt()));
            assertThat(chapterNos).isSorted();
        });
        assertThat(volumeNos).isSorted();
    }

    @Test
    void storyWithoutVolumesHasOnlyLooseChapters() throws Exception {
        Map<String, Object> story = row("""
                SELECT TOP (1) s.StoryId, s.Slug FROM dbo.vw_PublicStory s
                WHERE NOT EXISTS (SELECT 1 FROM dbo.Volume v WHERE v.StoryId = s.StoryId)
                ORDER BY s.StoryId""");

        JsonNode d = ok("/api/stories/" + slug(story));

        assertThat(d.get("volumes").size()).isZero();
        assertThat(d.get("looseChapters").size()).isEqualTo(d.get("chapterCount").asInt());
    }

    @Test
    void unpublishedAndDeletedChaptersAreNotInTheToc() throws Exception {
        Map<String, Object> story = row("""
                SELECT TOP (1) s.StoryId, s.Slug FROM dbo.vw_PublicStory s
                WHERE EXISTS (SELECT 1 FROM dbo.Chapter c WHERE c.StoryId = s.StoryId AND c.Status <> 'PUBLISHED')
                ORDER BY s.StoryId""");
        int storyId = id(story);
        List<Long> unpublished = jdbc.queryForList(
                "SELECT ChapterId FROM dbo.Chapter WHERE StoryId = ? AND Status <> 'PUBLISHED'", Long.class, storyId);
        long deleted = jdbc.queryForObject("""
                SELECT TOP (1) ChapterId FROM dbo.Chapter WHERE StoryId = ? AND Status = 'PUBLISHED'
                ORDER BY ChapterNo DESC""", Long.class, storyId);
        sql("UPDATE dbo.Chapter SET IsDeleted = 1 WHERE ChapterId = ?", deleted);

        List<Long> toc = tocChapterIds(ok("/api/stories/" + slug(story)));

        assertThat(unpublished).isNotEmpty();
        assertThat(toc).doesNotContainAnyElementsOf(unpublished).doesNotContain(deleted).isNotEmpty();
    }

    @Test
    void volumeWithoutPublishedChaptersIsHidden() throws Exception {
        Map<String, Object> story = storyWithVolumes();
        int storyId = id(story);
        int volumeId = jdbc.queryForObject("""
                SELECT TOP (1) v.VolumeId FROM dbo.Volume v
                WHERE v.StoryId = ? AND EXISTS (SELECT 1 FROM dbo.Chapter c WHERE c.VolumeId = v.VolumeId
                                                AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0)
                ORDER BY v.VolumeNo""", Integer.class, storyId);
        sql("UPDATE dbo.Chapter SET IsDeleted = 1 WHERE VolumeId = ?", volumeId);

        JsonNode d = ok("/api/stories/" + slug(story));

        List<Integer> volumeIds = new ArrayList<>();
        d.get("volumes").forEach(v -> volumeIds.add(v.get("volumeId").asInt()));
        assertThat(volumeIds).doesNotContain(volumeId);
    }

    @Test
    void nonPublicStoriesAre404() throws Exception {
        call("/api/stories/khong-ton-tai-" + uniqueUsername())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));

        for (String status : new String[] {"DRAFT", "HIDDEN"}) {
            String slug = jdbc.queryForObject(
                    "SELECT TOP (1) Slug FROM dbo.Story WHERE PublishStatus = ? ORDER BY StoryId", String.class, status);
            call("/api/stories/" + slug).andExpect(status().isNotFound());
        }

        Map<String, Object> story = storyWithVolumes();
        deleteStory(id(story));
        call("/api/stories/" + slug(story)).andExpect(status().isNotFound());
    }

    @Test
    void detailIsCachedByIdWithItsTtl() throws Exception {
        Map<String, Object> story = storyWithVolumes();
        JsonNode first = ok("/api/stories/" + slug(story));
        String key = CacheKeys.story(id(story));
        long ttl = ttlProperties.story().toSeconds();
        assertThat(redis.getExpire(key)).isBetween(ttl - 30, ttl);

        sql("UPDATE dbo.Story SET Title = N'IT changed title' WHERE StoryId = ?", id(story));

        assertThat(ok("/api/stories/" + slug(story)).get("title").asText()).isEqualTo(first.get("title").asText());
    }

    @Test
    void storyHiddenAfterBeingCachedIs404AtOnce() throws Exception {
        Map<String, Object> story = storyWithVolumes();
        ok("/api/stories/" + slug(story));

        hideStory(id(story));

        assertThat(redis.hasKey(CacheKeys.story(id(story)))).isTrue();     // nobody evicted it
        call("/api/stories/" + slug(story)).andExpect(status().isNotFound());
    }

    @Test
    void notFoundIsNotCached() throws Exception {
        String slug = jdbc.queryForObject(
                "SELECT TOP (1) Slug FROM dbo.Story WHERE PublishStatus = 'HIDDEN' ORDER BY StoryId", String.class);
        int storyId = jdbc.queryForObject("SELECT StoryId FROM dbo.Story WHERE Slug = ?", Integer.class, slug);

        call("/api/stories/" + slug).andExpect(status().isNotFound());

        assertThat(redis.hasKey(CacheKeys.story(storyId))).isFalse();
    }
}
