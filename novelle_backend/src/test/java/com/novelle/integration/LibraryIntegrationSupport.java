package com.novelle.integration;

import java.util.List;
import java.util.Map;

/**
 * Helpers for the library, rating and author-request tests (modules M4, M5). Fixtures are picked from the seed by
 * query, never by hard-coded id; every write happens in the test transaction and is rolled back.
 */
abstract class LibraryIntegrationSupport extends ReadingIntegrationSupport {

    /** A freshly registered READER (no follows, lists, ratings or requests yet). */
    protected record Reader(Client client, int userId, String username) {
    }

    /** An ACTIVE author, logged in, with one of their public stories. */
    protected record AuthorWithStory(Client client, int authorId, int storyId) {
    }

    protected Reader reader() throws Exception {
        Client client = newClient();
        String username = registerReader(client);
        return new Reader(client, userId(username), username);
    }

    protected List<Integer> publicStoryIds(int n) {
        return jdbc.queryForList("SELECT TOP (" + n + ") StoryId FROM dbo.vw_PublicStory ORDER BY StoryId", Integer.class);
    }

    protected int publicStoryId() {
        return publicStoryIds(1).get(0);
    }

    protected String slugOf(int storyId) {
        return jdbc.queryForObject("SELECT Slug FROM dbo.Story WHERE StoryId = ?", String.class, storyId);
    }

    protected int storyFollowCount(int storyId) {
        return (int) count("SELECT FollowCount FROM dbo.Story WHERE StoryId = ?", storyId);
    }

    protected AuthorWithStory authorWithPublicStory() throws Exception {
        Map<String, Object> r = row("""
                SELECT TOP (1) u.Username, s.AuthorId, s.StoryId
                FROM dbo.vw_PublicStory s JOIN dbo.[User] u ON u.UserId = s.AuthorId
                WHERE u.Status = 'ACTIVE' ORDER BY s.StoryId""");
        Client client = loginAs((String) r.get("Username"));
        return new AuthorWithStory(client, ((Number) r.get("AuthorId")).intValue(),
                ((Number) r.get("StoryId")).intValue());
    }

    /** An author other than {@code notUserId}. */
    protected int anotherAuthorId(int notUserId) {
        return (int) count("SELECT TOP (1) UserId FROM dbo.Author WHERE UserId <> ? ORDER BY UserId", notUserId);
    }
}
