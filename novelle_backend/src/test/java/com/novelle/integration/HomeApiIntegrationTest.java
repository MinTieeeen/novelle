package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.config.CatalogProperties;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** H1 GET /api/home. */
class HomeApiIntegrationTest extends CatalogIntegrationSupport {

    private static final String[] BLOCKS = {"latestUpdated", "newest", "topRated", "mostViewed", "completed"};

    @Autowired
    private CatalogProperties props;

    @Autowired
    private CacheTtlProperties ttlProperties;

    @Test
    void fiveBlocksOfAtMostHomeSizeStories() throws Exception {
        JsonNode home = ok("/api/home");
        for (String block : BLOCKS) {
            assertThat(home.get(block).size()).as(block).isBetween(1, props.homeSize());
        }
        assertThat(home.get("latestUpdated").size()).isEqualTo(props.homeSize());
    }

    @Test
    void eachBlockFollowsItsRule() throws Exception {
        JsonNode home = ok("/api/home");

        assertThat(instants(home.get("latestUpdated"), "lastChapterAt")).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(instants(home.get("newest"), "publishedAt")).isSortedAccordingTo(Comparator.reverseOrder());
        assertThat(longs(home.get("mostViewed"), "viewCount")).isSortedAccordingTo(Comparator.reverseOrder());

        home.get("topRated").forEach(s ->
                assertThat(s.get("ratingCount").asInt()).isGreaterThanOrEqualTo(props.topRatedMinRatings()));
        List<Double> ratings = new ArrayList<>();
        home.get("topRated").forEach(s -> ratings.add(s.get("ratingAvg").asDouble()));
        assertThat(ratings).isSortedAccordingTo(Comparator.reverseOrder());

        home.get("completed").forEach(s -> assertThat(s.get("completionStatus").asText()).isEqualTo("COMPLETED"));
    }

    @Test
    void cardsCarryAuthorAndPrimaryGenre() throws Exception {
        JsonNode card = ok("/api/home").get("latestUpdated").get(0);
        long primaryGenres = count("SELECT COUNT(*) FROM dbo.StoryGenre WHERE StoryId = ? AND IsPrimary = 1",
                card.get("storyId").asInt());

        assertThat(card.get("author").get("penName").asText()).isNotBlank();
        assertThat(card.has("primaryGenre")).isEqualTo(primaryGenres == 1);
        assertThat(card.get("description").asText().length()).isLessThanOrEqualTo(300);
    }

    @Test
    void hiddenAndDeletedStoriesLeaveEveryBlock() throws Exception {
        JsonNode first = ok("/api/home");
        int hidden = first.get("mostViewed").get(0).get("storyId").asInt();
        int deleted = first.get("latestUpdated").get(0).get("storyId").asInt();
        hideStory(hidden);
        deleteStory(deleted);
        redis.delete(CacheKeys.HOME);       // what the writing module (M6/M7) does

        JsonNode home = ok("/api/home");

        for (String block : BLOCKS) {
            assertThat(storyIds(home.get(block))).as(block).doesNotContain(hidden, deleted);
        }
    }

    @Test
    void homeIsServedFromTheCacheForTwoMinutes() throws Exception {
        JsonNode first = ok("/api/home");
        long ttl = ttlProperties.home().toSeconds();
        assertThat(redis.getExpire(CacheKeys.HOME)).isBetween(ttl - 30, ttl);

        int storyId = first.get("latestUpdated").get(0).get("storyId").asInt();
        sql("UPDATE dbo.Story SET Title = N'IT changed title' WHERE StoryId = ?", storyId);

        JsonNode second = ok("/api/home");
        assertThat(second.get("latestUpdated").get(0).get("title").asText())
                .isEqualTo(first.get("latestUpdated").get(0).get("title").asText());
    }

    private static List<Instant> instants(JsonNode items, String field) {
        List<Instant> values = new ArrayList<>();
        items.forEach(n -> values.add(Instant.parse(n.get(field).asText())));
        return values;
    }

    private static List<Long> longs(JsonNode items, String field) {
        List<Long> values = new ArrayList<>();
        items.forEach(n -> values.add(n.get(field).asLong()));
        return values;
    }
}
