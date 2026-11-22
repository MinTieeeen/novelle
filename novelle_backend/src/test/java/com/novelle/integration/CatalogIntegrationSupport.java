package com.novelle.integration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Helpers for the public catalog tests (module M2). Every fixture is a change of seeded rows through
 * {@link #sql}, rolled back with the test; stories are found by query, never by a hard-coded id.
 */
abstract class CatalogIntegrationSupport extends ApiIntegrationTest {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");

    /** GET as an anonymous visitor; params as name/value pairs. */
    protected ResultActions call(String url, String... params) throws Exception {
        MockHttpServletRequestBuilder request = get(url);
        for (int i = 0; i < params.length; i += 2) {
            request.param(params[i], params[i + 1]);
        }
        return newClient().perform(request);
    }

    protected JsonNode ok(String url, String... params) throws Exception {
        return json(call(url, params).andExpect(status().isOk()));
    }

    protected static List<Integer> storyIds(JsonNode items) {
        List<Integer> ids = new ArrayList<>();
        items.forEach(n -> ids.add(n.get("storyId").asInt()));
        return ids;
    }

    /** "Đế Vương Hào Hùng" → "De Vuong Hao Hung": what a user types without a Vietnamese keyboard. */
    protected static String unaccent(String text) {
        String stripped = MARKS.matcher(Normalizer.normalize(text, Normalizer.Form.NFD)).replaceAll("");
        return stripped.replace('đ', 'd').replace('Đ', 'D');
    }

    /** First row of a query as a column map (fixtures chosen from the seed). */
    protected Map<String, Object> row(String query, Object... args) {
        return jdbc.queryForList(query, args).get(0);
    }

    protected long count(String query, Object... args) {
        Long value = jdbc.queryForObject(query, Long.class, args);
        return value == null ? 0 : value;
    }

    protected int hideStory(int storyId) {
        return sql("UPDATE dbo.Story SET PublishStatus = 'HIDDEN', HiddenReason = N'IT' WHERE StoryId = ?", storyId);
    }

    protected int deleteStory(int storyId) {
        return sql("UPDATE dbo.Story SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME() WHERE StoryId = ?", storyId);
    }
}
