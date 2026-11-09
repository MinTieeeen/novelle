package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Reading lists (M4: T1–T9). ItemCount is kept by the service; every write locks the list row first. */
class ReadingListApiIntegrationTest extends LibraryIntegrationSupport {

    private static final String BASE = "/api/reading-lists";

    private static Map<String, Object> list(String name, Boolean isPublic) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        if (isPublic != null) {
            body.put("isPublic", isPublic);
        }
        return body;
    }

    private int create(Client c, String name, boolean isPublic) throws Exception {
        return json(c.post(BASE, list(name, isPublic)).andExpect(status().isCreated())).get("listId").asInt();
    }

    private void add(Client c, int listId, int storyId) throws Exception {
        c.post(BASE + "/" + listId + "/items", Map.of("storyId", storyId)).andExpect(status().isCreated());
    }

    private long itemCount(int listId) {
        return count("SELECT ItemCount FROM dbo.ReadingList WHERE ListId = ?", listId);
    }

    private long itemRows(int listId) {
        return count("SELECT COUNT(*) FROM dbo.ReadingListItem WHERE ListId = ?", listId);
    }

    private List<Integer> orderInDb(int listId) {
        return jdbc.queryForList("SELECT StoryId FROM dbo.ReadingListItem WHERE ListId = ? ORDER BY OrderNo",
                Integer.class, listId);
    }

    private List<Integer> orderNos(int listId) {
        return jdbc.queryForList("SELECT OrderNo FROM dbo.ReadingListItem WHERE ListId = ? ORDER BY OrderNo",
                Integer.class, listId);
    }

    /* ---------- lists ---------- */

    @Test
    void createDefaultsToPrivateAndAppearsInMyLists() throws Exception {
        Reader r = reader();

        JsonNode res = json(r.client().post(BASE, Map.of("name", "  Hè 2026 ", "description", "  Nhẹ nhàng "))
                .andExpect(status().isCreated()));

        assertThat(res.get("name").asText()).isEqualTo("Hè 2026");
        assertThat(res.get("description").asText()).isEqualTo("Nhẹ nhàng");
        assertThat(res.get("isPublic").asBoolean()).isFalse();
        assertThat(res.get("itemCount").asInt()).isZero();
        JsonNode mine = json(r.client().get(BASE).andExpect(status().isOk()));
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).get("listId").asInt()).isEqualTo(res.get("listId").asInt());
    }

    @Test
    void namesAreUniquePerUserIgnoringCase() throws Exception {
        Reader r = reader();
        create(r.client(), "Yêu thích", false);

        r.client().post(BASE, list("YÊU THÍCH", true)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("READING_LIST_NAME_TAKEN"));
        create(reader().client(), "Yêu thích", false);                       // another user may use it
    }

    @Test
    void createValidation() throws Exception {
        Reader r = reader();
        r.client().post(BASE, list("   ", false)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("name"));
        r.client().post(BASE, list("x".repeat(101), false)).andExpect(status().isBadRequest());
        r.client().post(BASE, Map.of("name", "ok", "description", "x".repeat(501))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("description"));
    }

    @Test
    void listLimitPerUser() throws Exception {
        Reader r = reader();
        sql("""
                INSERT dbo.ReadingList (UserId, Name)
                SELECT ?, CONCAT(N'IT list ', n)
                FROM (SELECT TOP (50) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_columns) x""",
                r.userId());

        r.client().post(BASE, list("one more", false)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("READING_LIST_LIMIT"));
    }

    @Test
    void patchRenamesClearsDescriptionAndPublishes() throws Exception {
        Reader r = reader();
        int id = json(r.client().post(BASE, Map.of("name", "Cũ", "description", "mô tả"))
                .andExpect(status().isCreated())).get("listId").asInt();

        JsonNode res = json(r.client().patch(BASE + "/" + id, Map.of("name", " Mới ", "description", "", "isPublic", true))
                .andExpect(status().isOk()));

        assertThat(res.get("name").asText()).isEqualTo("Mới");
        assertThat(res.has("description")).isFalse();
        assertThat(res.get("isPublic").asBoolean()).isTrue();

        r.client().patch(BASE + "/" + id, Map.of()).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Mới"));                    // nothing sent = unchanged
        r.client().patch(BASE + "/" + id, Map.of("name", "  ")).andExpect(status().isBadRequest());
    }

    @Test
    void renameToAnExistingNameIsTaken() throws Exception {
        Reader r = reader();
        create(r.client(), "A", false);
        int b = create(r.client(), "B", false);

        r.client().patch(BASE + "/" + b, Map.of("name", "a")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("READING_LIST_NAME_TAKEN"));
    }

    @Test
    void deleteRemovesTheListAndItsItems() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Xoá", false);
        add(r.client(), id, publicStoryId());

        r.client().delete(BASE + "/" + id).andExpect(status().isNoContent());

        assertThat(count("SELECT COUNT(*) FROM dbo.ReadingList WHERE ListId = ?", id)).isZero();
        assertThat(itemRows(id)).isZero();
        r.client().delete(BASE + "/" + id).andExpect(status().isNotFound());
    }

    /* ---------- visibility ---------- */

    @Test
    void privateListOfSomeoneElseLooksMissing() throws Exception {
        Reader owner = reader();
        int id = create(owner.client(), "Riêng", false);
        Client other = reader().client();

        other.get(BASE + "/" + id).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("READING_LIST_NOT_FOUND"));
        call(BASE + "/" + id).andExpect(status().isNotFound());
        other.patch(BASE + "/" + id, Map.of("name", "hack")).andExpect(status().isNotFound());
        other.post(BASE + "/" + id + "/items", Map.of("storyId", publicStoryId())).andExpect(status().isNotFound());
        other.delete(BASE + "/" + id).andExpect(status().isNotFound());

        owner.client().get(BASE + "/" + id).andExpect(status().isOk())
                .andExpect(jsonPath("$.isOwner").value(true))
                .andExpect(jsonPath("$.owner.username").value(owner.username()));
    }

    @Test
    void publicListIsVisibleToAnonymousVisitorsAndOnTheProfile() throws Exception {
        Reader owner = reader();
        int pub = create(owner.client(), "Công khai", true);
        create(owner.client(), "Riêng", false);
        add(owner.client(), pub, publicStoryId());

        JsonNode detail = ok(BASE + "/" + pub);
        assertThat(detail.get("isOwner").asBoolean()).isFalse();
        assertThat(detail.get("items").get("totalElements").asInt()).isEqualTo(1);

        JsonNode lists = ok("/api/users/" + owner.username() + "/reading-lists");
        assertThat(lists).hasSize(1);
        assertThat(lists.get(0).get("listId").asInt()).isEqualTo(pub);
        call("/api/users/no_such_user_it/reading-lists").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    /* ---------- items ---------- */

    @Test
    void addingAndRemovingKeepsItemCountEqualToTheRows() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Đọc dần", false);
        List<Integer> stories = publicStoryIds(3);

        JsonNode first = json(r.client().post(BASE + "/" + id + "/items",
                Map.of("storyId", stories.get(0), "note", "  đọc trước ")).andExpect(status().isCreated()));
        assertThat(first.get("orderNo").asInt()).isEqualTo(1);
        assertThat(first.get("note").asText()).isEqualTo("đọc trước");
        assertThat(first.get("story").get("storyId").asInt()).isEqualTo(stories.get(0));
        add(r.client(), id, stories.get(1));
        add(r.client(), id, stories.get(2));
        assertThat(orderNos(id)).containsExactly(1, 2, 3);
        assertThat(itemCount(id)).isEqualTo(3).isEqualTo(itemRows(id));

        r.client().post(BASE + "/" + id + "/items", Map.of("storyId", stories.get(1)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STORY_ALREADY_IN_LIST"));
        assertThat(itemCount(id)).isEqualTo(3);

        r.client().delete(BASE + "/" + id + "/items/" + stories.get(1)).andExpect(status().isNoContent());
        assertThat(itemCount(id)).isEqualTo(2).isEqualTo(itemRows(id));
        r.client().delete(BASE + "/" + id + "/items/" + stories.get(1)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("STORY_NOT_IN_LIST"));

        // appending after a removal keeps OrderNo increasing
        add(r.client(), id, stories.get(1));
        assertThat(orderInDb(id)).containsExactly(stories.get(0), stories.get(2), stories.get(1));
    }

    @Test
    void hiddenStoryCannotBeAddedButCanBeRemoved() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Ẩn", false);
        List<Integer> stories = publicStoryIds(2);
        add(r.client(), id, stories.get(0));
        hideStory(stories.get(0));
        hideStory(stories.get(1));

        r.client().post(BASE + "/" + id + "/items", Map.of("storyId", stories.get(1)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("STORY_NOT_FOUND"));
        JsonNode detail = json(r.client().get(BASE + "/" + id).andExpect(status().isOk()));
        assertThat(detail.get("itemCount").asInt()).isEqualTo(1);                   // D3: counts every row
        assertThat(detail.get("items").get("totalElements").asInt()).isZero();      // but shows public ones only

        r.client().delete(BASE + "/" + id + "/items/" + stories.get(0)).andExpect(status().isNoContent());
        assertThat(itemCount(id)).isZero();
    }

    @Test
    void fullListRejectsNewStories() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Đầy", false);
        sql("UPDATE dbo.ReadingList SET ItemCount = 500 WHERE ListId = ?", id);

        r.client().post(BASE + "/" + id + "/items", Map.of("storyId", publicStoryId()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("READING_LIST_LIMIT"));
    }

    @Test
    void itemValidation() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "V", false);
        r.client().post(BASE + "/" + id + "/items", Map.of()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("storyId"));
        r.client().post(BASE + "/" + id + "/items", Map.of("storyId", publicStoryId(), "note", "x".repeat(301)))
                .andExpect(status().isBadRequest());
    }

    /* ---------- reorder ---------- */

    @Test
    void reorderWritesTheNewOrder() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Thứ tự", false);
        List<Integer> s = publicStoryIds(3);
        s.forEach(story -> {
            try {
                add(r.client(), id, story);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        r.client().put(BASE + "/" + id + "/items/order", Map.of("storyIds", List.of(s.get(2), s.get(0), s.get(1))))
                .andExpect(status().isNoContent());

        assertThat(orderInDb(id)).containsExactly(s.get(2), s.get(0), s.get(1));
        assertThat(orderNos(id)).containsExactly(1, 2, 3);
        JsonNode items = json(r.client().get(BASE + "/" + id).andExpect(status().isOk())).get("items").get("items");
        assertThat(items.get(0).get("story").get("storyId").asInt()).isEqualTo(s.get(2));
    }

    @Test
    void reorderKeepsHiddenStoriesLast() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Ẩn giữa", false);
        List<Integer> s = publicStoryIds(3);
        for (int story : s) {
            add(r.client(), id, story);
        }
        hideStory(s.get(1));

        r.client().put(BASE + "/" + id + "/items/order", Map.of("storyIds", List.of(s.get(2), s.get(0))))
                .andExpect(status().isNoContent());

        assertThat(orderInDb(id)).containsExactly(s.get(2), s.get(0), s.get(1));
        assertThat(orderNos(id)).containsExactly(1, 2, 3);
    }

    @Test
    void reorderRejectsAWrongSet() throws Exception {
        Reader r = reader();
        int id = create(r.client(), "Sai", false);
        List<Integer> s = publicStoryIds(3);
        add(r.client(), id, s.get(0));
        add(r.client(), id, s.get(1));
        String url = BASE + "/" + id + "/items/order";

        r.client().put(url, Map.of("storyIds", List.of(s.get(0)))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_ITEM_ORDER"));
        r.client().put(url, Map.of("storyIds", List.of(s.get(0), s.get(1), s.get(2)))).andExpect(status().isBadRequest());
        r.client().put(url, Map.of("storyIds", List.of(s.get(0), s.get(0)))).andExpect(status().isBadRequest());
        r.client().put(url, Map.of()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        assertThat(orderInDb(id)).containsExactly(s.get(0), s.get(1));
    }

    /* ---------- security ---------- */

    @Test
    void loginAndCsrfAreRequired() throws Exception {
        call(BASE).andExpect(status().isUnauthorized());
        newClient().csrf().post(BASE, list("x", false)).andExpect(status().isUnauthorized());
        Reader r = reader();
        int id = create(r.client(), "C", false);
        r.client().postWithoutCsrf(BASE, list("y", false)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        r.client().deleteWithoutCsrf(BASE + "/" + id).andExpect(status().isForbidden());
        r.client().putWithoutCsrf(BASE + "/" + id + "/items/order", Map.of("storyIds", List.of()))
                .andExpect(status().isForbidden());
    }
}
