package com.novelle.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.util.Map;
import java.util.Set;

import com.novelle.TestProperties;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Helpers for the reading tests (module M3). Chapters are found by query (never a hard-coded id) and changed
 * only through {@link #sql}; view keys live under {@code it:views:} (TestProperties) and are removed by
 * ApiIntegrationTest before and after each test.
 */
abstract class ReadingIntegrationSupport extends CatalogIntegrationSupport {

    protected static final String VIEWS = TestProperties.VIEWS_PREFIX_VALUE;

    /** A public chapter. */
    protected record Chap(long id, int storyId, int no) {
    }

    private static Chap chap(Map<String, Object> row) {
        return new Chap(((Number) row.get("ChapterId")).longValue(), ((Number) row.get("StoryId")).intValue(),
                ((Number) row.get("ChapterNo")).intValue());
    }

    /**
     * A public chapter inside a volume whose chapters no-2 … no+2 are all public, so prev / next can be moved by
     * hiding a neighbour.
     */
    protected Chap middleChapter() {
        return chap(row("""
                SELECT TOP (1) c.ChapterId, c.StoryId, c.ChapterNo
                FROM dbo.Chapter c
                JOIN dbo.vw_PublicStory s ON s.StoryId = c.StoryId
                WHERE c.Status = 'PUBLISHED' AND c.IsDeleted = 0 AND c.VolumeId IS NOT NULL
                  AND (SELECT COUNT(*) FROM dbo.Chapter n
                       WHERE n.StoryId = c.StoryId AND n.ChapterNo BETWEEN c.ChapterNo - 2 AND c.ChapterNo + 2
                         AND n.Status = 'PUBLISHED' AND n.IsDeleted = 0) = 5
                ORDER BY c.ChapterId"""));
    }

    /** The first public chapter of a public story. */
    protected Chap firstChapter() {
        return chap(row("""
                SELECT TOP (1) c.ChapterId, c.StoryId, c.ChapterNo
                FROM dbo.Chapter c
                JOIN dbo.vw_PublicStory s ON s.StoryId = c.StoryId
                WHERE c.Status = 'PUBLISHED' AND c.IsDeleted = 0
                  AND NOT EXISTS (SELECT 1 FROM dbo.Chapter p WHERE p.StoryId = c.StoryId AND p.ChapterNo < c.ChapterNo
                                  AND p.Status = 'PUBLISHED' AND p.IsDeleted = 0)
                ORDER BY c.ChapterId"""));
    }

    /** A public chapter of another public story than {@code storyId}. */
    protected Chap chapterOfAnotherStory(int storyId) {
        return chap(row("""
                SELECT TOP (1) c.ChapterId, c.StoryId, c.ChapterNo
                FROM dbo.Chapter c
                JOIN dbo.vw_PublicStory s ON s.StoryId = c.StoryId
                WHERE c.Status = 'PUBLISHED' AND c.IsDeleted = 0 AND c.StoryId <> ?
                ORDER BY c.ChapterId""", storyId));
    }

    protected long chapterId(int storyId, int chapterNo) {
        return count("SELECT ChapterId FROM dbo.Chapter WHERE StoryId = ? AND ChapterNo = ?", storyId, chapterNo);
    }

    protected int userId(String username) {
        return (int) count("SELECT UserId FROM dbo.[User] WHERE Username = ?", username);
    }

    /* ---------- fixtures (rolled back) ---------- */

    protected void setChapterStatus(long chapterId, String status) {
        sql("""
                UPDATE dbo.Chapter
                SET Status = ?, ScheduledAt = CASE WHEN ? = 'SCHEDULED' THEN DATEADD(DAY, 1, SYSUTCDATETIME()) END
                WHERE ChapterId = ?""", status, status, chapterId);
    }

    protected void deleteChapter(long chapterId) {
        sql("UPDATE dbo.Chapter SET IsDeleted = 1 WHERE ChapterId = ?", chapterId);
    }

    /* ---------- requests ---------- */

    protected ResultActions read(Client client, long chapterId) throws Exception {
        return client.perform(get("/api/chapters/" + chapterId));
    }

    /* ---------- Redis view keys ---------- */

    /** Sum of the counters of a story ('S') or chapter ('C') over all days (avoids depending on the day). */
    protected long counter(char type, long id) {
        Set<String> keys = redis.keys(VIEWS + (type == 'S' ? "story:" : "chapter:") + id + ":*");
        long total = 0;
        if (keys != null) {
            for (String k : keys) {
                String v = redis.opsForValue().get(k);
                total += v == null ? 0 : Long.parseLong(v);
            }
        }
        return total;
    }

    protected Set<String> dirtyMembers() {
        Set<String> members = redis.opsForSet().members(VIEWS + "dirty");
        return members == null ? Set.of() : members;
    }

    protected Set<String> viewKeys() {
        Set<String> keys = redis.keys(VIEWS + "*");
        return keys == null ? Set.of() : keys;
    }
}
