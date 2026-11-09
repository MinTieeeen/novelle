package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Chapter revisions (M6: R1–R3, RB10). Revisions are written by trg_Chapter_Revision when a chapter is saved. */
class StudioRevisionApiIntegrationTest extends StudioIntegrationSupport {

    private static String revisions(long chapterId) {
        return "/api/studio/chapters/" + chapterId + "/revisions";
    }

    /** A chapter saved twice: revisions 1 ("v0") and 2 ("v1"); current text "v2". Returns {chapterId, version}. */
    private Object[] chapterWithTwoRevisions(Author a) throws Exception {
        JsonNode c = createChapter(a, createStory(a).get("storyId").asInt(), "T0", "<p>v0</p>", null);
        long id = c.get("chapterId").asLong();
        String version = c.get("version").asText();
        version = json(a.client().put("/api/studio/chapters/" + id, saveBody("T1", "<p>v1</p>", null, version))
                .andExpect(status().isOk())).get("version").asText();
        version = json(a.client().put("/api/studio/chapters/" + id, saveBody("T2", "<p>v2 hai</p>", null, version))
                .andExpect(status().isOk())).get("version").asText();
        return new Object[] {id, version};
    }

    @Test
    void listIsNewestFirstWithoutContent() throws Exception {
        Author a = author();
        long id = (long) chapterWithTwoRevisions(a)[0];

        JsonNode list = json(a.client().get(revisions(id)).andExpect(status().isOk()));

        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("revisionNo").asInt()).isEqualTo(2);
        assertThat(list.get(0).get("title").asText()).isEqualTo("T1");
        assertThat(list.get(0).has("content")).isFalse();
        assertThat(list.get(0).get("editedBy").get("authorId").asInt()).isEqualTo(a.authorId());
        assertThat(list.get(1).get("revisionNo").asInt()).isEqualTo(1);
    }

    @Test
    void oneRevisionHasItsContent() throws Exception {
        Author a = author();
        long id = (long) chapterWithTwoRevisions(a)[0];

        a.client().get(revisions(id) + "/1").andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("T0"))
                .andExpect(jsonPath("$.content").value("<p>v0</p>"))
                .andExpect(jsonPath("$.wordCount").value(1));
        a.client().get(revisions(id) + "/99").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("REVISION_NOT_FOUND"));
    }

    @Test
    void restoreWritesTheOldTextAndKeepsTheReplacedOneAsANewRevision() throws Exception {
        Author a = author();
        Object[] c = chapterWithTwoRevisions(a);
        long id = (long) c[0];

        JsonNode restored = json(a.client().post(revisions(id) + "/1/restore", Map.of("version", c[1]))
                .andExpect(status().isOk()));

        assertThat(restored.get("title").asText()).isEqualTo("T0");
        assertThat(restored.get("content").asText()).isEqualTo("<p>v0</p>");
        assertThat(restored.get("wordCount").asInt()).isEqualTo(1);
        Map<String, Object> newest = row("SELECT TOP (1) RevisionNo, Title, Content FROM dbo.ChapterRevision "
                + "WHERE ChapterId = ? ORDER BY RevisionNo DESC", id);
        assertThat(((Number) newest.get("RevisionNo")).intValue()).isEqualTo(3);
        assertThat(newest.get("Content")).isEqualTo("<p>v2 hai</p>");
        // revision 1 itself is unchanged (append-only)
        assertThat(jdbc.queryForObject("SELECT Content FROM dbo.ChapterRevision WHERE ChapterId = ? AND RevisionNo = 1",
                String.class, id)).isEqualTo("<p>v0</p>");
    }

    @Test
    void restoreWithAnOldVersionIsRejected() throws Exception {
        Author a = author();
        Object[] c = chapterWithTwoRevisions(a);
        long id = (long) c[0];
        a.client().post(revisions(id) + "/1/restore", Map.of("version", c[1])).andExpect(status().isOk());

        a.client().post(revisions(id) + "/2/restore", Map.of("version", c[1])).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_DATA"));
        a.client().post(revisions(id) + "/99/restore", Map.of("version", c[1])).andExpect(status().isNotFound());
    }
}
