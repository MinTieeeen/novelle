package com.novelle.integration;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.novelle.infrastructure.cache.DraftKeys;
import com.novelle.mapper.ViewFlushMapper;
import com.novelle.model.ViewDelta;
import com.novelle.model.ViewDeltaBatch;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Helpers for the studio tests (module M6). Stories and chapters are created through the API inside the test
 * transaction (rolled back); drafts ({@code draft:{authorId}:*}) of the authors used are removed after each test.
 */
abstract class StudioIntegrationSupport extends LibraryIntegrationSupport {

    protected static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired private ViewFlushMapper viewFlushMapper;

    private final List<Integer> authorIds = new ArrayList<>();

    /** A logged-in ACTIVE author. */
    protected record Author(Client client, int authorId) {
    }

    @AfterEach
    void deleteDrafts() {
        for (int id : authorIds) {
            Set<String> keys = redis.keys(DraftKeys.PREFIX + id + ":*");
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
        }
    }

    protected Author author() throws Exception {
        return loginAuthor(seededActiveAuthor());
    }

    /** Another ACTIVE author than {@code notUserId}. */
    protected Author otherAuthor(int notUserId) throws Exception {
        String username = jdbc.queryForObject("""
                SELECT TOP (1) u.Username FROM dbo.[User] u JOIN dbo.Author a ON a.UserId = u.UserId
                WHERE u.Status = 'ACTIVE' AND u.UserId <> ? ORDER BY u.UserId""", String.class, notUserId);
        return loginAuthor(username);
    }

    private Author loginAuthor(String username) throws Exception {
        Client client = loginAs(username);
        int id = userId(username);
        authorIds.add(id);
        return new Author(client, id);
    }

    protected List<Integer> genreIds(int n) {
        return jdbc.queryForList("SELECT TOP (" + n + ") GenreId FROM dbo.Genre ORDER BY GenreId", Integer.class);
    }

    /** A title no seeded story has, so the slug is predictable. */
    protected static String uniqueTitle() {
        return "IT Truyện " + uniqueUsername().substring(3);
    }

    protected Map<String, Object> storyBody(String title) {
        List<Integer> g = genreIds(2);
        Map<String, Object> body = new HashMap<>();
        body.put("title", title);
        body.put("description", "Mô tả thử");
        body.put("coverUrl", "/covers/tien-hiep/03.jpg");
        body.put("ageRating", "13+");
        body.put("completionStatus", "ONGOING");
        body.put("genreIds", g);
        body.put("primaryGenreId", g.get(1));
        body.put("tags", List.of("Hệ thống", "IT tag " + title.substring(title.length() - 6)));
        return body;
    }

    protected JsonNode createStory(Author a) throws Exception {
        return createStory(a, uniqueTitle());
    }

    protected JsonNode createStory(Author a, String title) throws Exception {
        return json(a.client().post("/api/studio/stories", storyBody(title)).andExpect(status().isCreated()));
    }

    protected JsonNode createChapter(Author a, int storyId, String content) throws Exception {
        return createChapter(a, storyId, "Chương thử", content, null);
    }

    protected JsonNode createChapter(Author a, int storyId, String title, String content, Integer volumeId)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("title", title);
        body.put("content", content);
        body.put("volumeId", volumeId);
        return json(a.client().post("/api/studio/stories/" + storyId + "/chapters", body)
                .andExpect(status().isCreated()));
    }

    protected Map<String, Object> saveBody(String title, String content, Object volumeId, String version) {
        Map<String, Object> body = new HashMap<>();
        body.put("title", title);
        body.put("content", content);
        body.put("volumeId", volumeId);
        body.put("version", version);
        return body;
    }

    protected JsonNode publishChapter(Author a, long chapterId) throws Exception {
        return json(a.client().post("/api/studio/chapters/" + chapterId + "/publish", null)
                .andExpect(status().isOk()));
    }

    /** A story with one published chapter, made public: what readers can see. */
    protected int publicStoryOf(Author a) throws Exception {
        int storyId = createStory(a).get("storyId").asInt();
        long chapterId = createChapter(a, storyId, "<p>một hai ba</p>").get("chapterId").asLong();
        publishChapter(a, chapterId);
        a.client().post("/api/studio/stories/" + storyId + "/publish", null).andExpect(status().isOk());
        return storyId;
    }

    /** Runs the real sp_FlushViews with views for today (Vietnam), as the view job would. */
    protected void flushViews(int storyId, Long chapterId, int views) {
        LocalDate today = LocalDate.now(VN);
        List<ViewDelta> deltas = new ArrayList<>();
        deltas.add(new ViewDelta('S', storyId, today, views));
        if (chapterId != null) {
            deltas.add(new ViewDelta('C', chapterId, today, views));
        }
        viewFlushMapper.flush(new ViewDeltaBatch(deltas));
    }

    protected String rowVersionHex(long chapterId) {
        return jdbc.queryForObject("SELECT CONVERT(VARCHAR(20), RowVer, 1) FROM dbo.Chapter WHERE ChapterId = ?",
                String.class, chapterId);
    }

    /** A story of another author, not deleted, any status. */
    protected int storyOfAnotherAuthor(int authorId) {
        return (int) count("SELECT TOP (1) StoryId FROM dbo.Story WHERE AuthorId <> ? AND IsDeleted = 0 ORDER BY StoryId",
                authorId);
    }

    protected long chapterOfAnotherAuthor(int authorId) {
        return count("""
                SELECT TOP (1) c.ChapterId FROM dbo.Chapter c JOIN dbo.Story s ON s.StoryId = c.StoryId
                WHERE s.AuthorId <> ? AND c.IsDeleted = 0 AND s.IsDeleted = 0 ORDER BY c.ChapterId""", authorId);
    }
}
