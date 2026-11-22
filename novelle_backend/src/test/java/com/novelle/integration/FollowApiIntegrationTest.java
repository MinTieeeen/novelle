package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.CacheKeys;
import org.junit.jupiter.api.Test;

/** Following stories and authors (M4: F1–F8). Counters are kept by trg_Follow / trg_AuthorFollow. */
class FollowApiIntegrationTest extends LibraryIntegrationSupport {

    private static String storyUrl(int storyId) {
        return "/api/stories/" + storyId + "/follow";
    }

    private static String authorUrl(int authorId) {
        return "/api/authors/" + authorId + "/follow";
    }

    private long followRows(int storyId) {
        return count("SELECT COUNT(*) FROM dbo.Follow WHERE StoryId = ?", storyId);
    }

    /* ---------- stories ---------- */

    @Test
    void followingTwiceCountsOnceAndMatchesTheTrigger() throws Exception {
        int story = publicStoryId();
        int before = storyFollowCount(story);
        Reader r = reader();

        r.client().put(storyUrl(story), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.storyId").value(story))
                .andExpect(jsonPath("$.following").value(true))
                .andExpect(jsonPath("$.followCount").value(before + 1));
        r.client().put(storyUrl(story), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.followCount").value(before + 1));

        assertThat(storyFollowCount(story)).isEqualTo(before + 1).isEqualTo((int) followRows(story));
        assertThat(count("SELECT COUNT(*) FROM dbo.Follow WHERE UserId = ? AND StoryId = ?", r.userId(), story))
                .isEqualTo(1);
    }

    @Test
    void statusAndIdempotentUnfollow() throws Exception {
        int story = publicStoryId();
        int before = storyFollowCount(story);
        Reader r = reader();

        r.client().get(storyUrl(story)).andExpect(jsonPath("$.following").value(false));
        r.client().put(storyUrl(story), null).andExpect(status().isOk());
        r.client().get(storyUrl(story)).andExpect(jsonPath("$.following").value(true));

        r.client().delete(storyUrl(story)).andExpect(status().isOk())
                .andExpect(jsonPath("$.following").value(false))
                .andExpect(jsonPath("$.followCount").value(before));
        r.client().delete(storyUrl(story)).andExpect(status().isOk())
                .andExpect(jsonPath("$.followCount").value(before));
    }

    @Test
    void followingEvictsTheCachedStoryDetail() throws Exception {
        int story = publicStoryId();
        call("/api/stories/" + slugOf(story)).andExpect(status().isOk());
        assertThat(redis.hasKey(CacheKeys.story(story))).isTrue();

        reader().client().put(storyUrl(story), null).andExpect(status().isOk());

        assertThat(redis.hasKey(CacheKeys.story(story))).isFalse();
        JsonNode detail = ok("/api/stories/" + slugOf(story));
        assertThat(detail.get("followCount").asInt()).isEqualTo(storyFollowCount(story));
    }

    @Test
    void hiddenStoryCannotBeFollowedButCanBeUnfollowed() throws Exception {
        int story = publicStoryId();
        Reader r = reader();
        r.client().put(storyUrl(story), null).andExpect(status().isOk());
        hideStory(story);

        r.client().put(storyUrl(story), null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        r.client().get(storyUrl(story)).andExpect(status().isNotFound());
        r.client().delete(storyUrl(story)).andExpect(status().isOk())
                .andExpect(jsonPath("$.following").value(false));
        assertThat(count("SELECT COUNT(*) FROM dbo.Follow WHERE UserId = ?", r.userId())).isZero();
    }

    @Test
    void unknownStoryIsNotFound() throws Exception {
        Reader r = reader();
        r.client().put(storyUrl(999_999_999), null).andExpect(status().isNotFound());
        r.client().delete(storyUrl(999_999_999)).andExpect(status().isNotFound());
    }

    @Test
    void followedStoriesShowPublicOnesNewestChapterFirst() throws Exception {
        List<Integer> stories = publicStoryIds(3);
        Reader r = reader();
        for (int s : stories) {
            r.client().put(storyUrl(s), null).andExpect(status().isOk());
        }
        hideStory(stories.get(2));

        JsonNode page = json(r.client().get("/api/library/follows").andExpect(status().isOk()));

        assertThat(page.get("totalElements").asInt()).isEqualTo(2);
        assertThat(storyIds(page.get("items"))).containsExactlyInAnyOrder(stories.get(0), stories.get(1));
        String first = page.get("items").get(0).path("lastChapterAt").asText("");
        String second = page.get("items").get(1).path("lastChapterAt").asText("");
        if (!first.isEmpty() && !second.isEmpty()) {
            assertThat(first.compareTo(second)).isGreaterThanOrEqualTo(0);
        }
    }

    /* ---------- authors ---------- */

    @Test
    void followAnAuthorAndListIt() throws Exception {
        Reader r = reader();
        int author = anotherAuthorId(r.userId());
        int before = (int) count("SELECT FollowerCount FROM dbo.Author WHERE UserId = ?", author);

        r.client().put(authorUrl(author), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.following").value(true))
                .andExpect(jsonPath("$.followerCount").value(before + 1));
        r.client().put(authorUrl(author), null).andExpect(jsonPath("$.followerCount").value(before + 1));
        r.client().get(authorUrl(author)).andExpect(jsonPath("$.following").value(true));

        JsonNode list = json(r.client().get("/api/library/authors").andExpect(status().isOk()));
        assertThat(list.get("totalElements").asInt()).isEqualTo(1);
        JsonNode item = list.get("items").get(0);
        assertThat(item.get("authorId").asInt()).isEqualTo(author);
        assertThat(item.get("penName").asText()).isNotBlank();
        assertThat(item.has("isVerified")).isTrue();
        assertThat(item.get("followedAt").asText()).endsWith("Z");

        r.client().delete(authorUrl(author)).andExpect(status().isOk())
                .andExpect(jsonPath("$.followerCount").value(before));
        assertThat(count("SELECT FollowerCount FROM dbo.Author WHERE UserId = ?", author))
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.AuthorFollow WHERE AuthorId = ?", author));
    }

    @Test
    void anAuthorCannotFollowThemself() throws Exception {
        AuthorWithStory a = authorWithPublicStory();

        a.client().put(authorUrl(a.authorId()), null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CANNOT_FOLLOW_SELF"));
    }

    @Test
    void unknownAuthorIsNotFound() throws Exception {
        Reader r = reader();
        r.client().put(authorUrl(r.userId()), null).andExpect(status().isNotFound())      // a reader is no author
                .andExpect(jsonPath("$.code").value("AUTHOR_NOT_FOUND"));
        r.client().get(authorUrl(999_999_999)).andExpect(status().isNotFound());
    }

    /* ---------- security, rate limit ---------- */

    @Test
    void statusNeedsLoginEvenUnderThePublicStoryPaths() throws Exception {
        int story = publicStoryId();
        call(storyUrl(story)).andExpect(status().isUnauthorized());
        call(authorUrl(anotherAuthorId(0))).andExpect(status().isUnauthorized());
        call("/api/library/follows").andExpect(status().isUnauthorized());
        call("/api/library/authors").andExpect(status().isUnauthorized());
        reader().client().putWithoutCsrf(storyUrl(story), null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        reader().client().deleteWithoutCsrf(storyUrl(story)).andExpect(status().isForbidden());
    }

    @Test
    void followingIsRateLimitedPerUser() throws Exception {
        Reader r = reader();
        // unknown story: 404 without any write; the limiter counts the request anyway
        for (int i = 0; i < 60; i++) {
            r.client().put(storyUrl(999_999_999), null).andExpect(status().isNotFound());
        }
        r.client().put(storyUrl(999_999_999), null).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        assertThat(redis.getExpire("rl:follow:u" + r.userId())).isPositive().isLessThanOrEqualTo(60L);
    }
}
