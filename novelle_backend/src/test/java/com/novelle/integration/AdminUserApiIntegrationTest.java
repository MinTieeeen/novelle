package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** User management (M7: U1–U6, D1, D7, D8, RB12, RB16). */
class AdminUserApiIntegrationTest extends AdminIntegrationSupport {

    private static final String USERS = ADMIN + "/users";

    @Test
    void listFiltersMatchSql() throws Exception {
        Admin ad = admin();
        long authors = count("SELECT COUNT(*) FROM dbo.[User] WHERE Role = 'AUTHOR' AND Status = 'ACTIVE'");

        JsonNode page = json(ad.client().get(USERS + "?role=author&status=ACTIVE&size=50").andExpect(status().isOk()));

        assertThat(page.get("totalElements").asLong()).isEqualTo(authors);
        page.get("items").forEach(u -> assertThat(u.get("role").asText()).isEqualTo("AUTHOR"));
        ad.client().get(USERS + "?role=OWNER").andExpect(status().isBadRequest());
    }

    @Test
    void textSearchTreatsUnderscoreLiterally() throws Exception {
        Admin ad = admin();
        Reader r = reader();                      // username it_xxxxxxxxxxxx
        String part = r.username().substring(0, 6);   // "it_xxx": the '_' must not match any character

        JsonNode page = json(ad.client().get(USERS + "?q=" + part + "&size=50").andExpect(status().isOk()));

        assertThat(page.get("items").findValuesAsText("username")).contains(r.username());
        page.get("items").forEach(u -> assertThat(u.get("username").asText() + u.get("email").asText()
                + u.get("displayName").asText()).containsIgnoringCase(part));
    }

    @Test
    void detailOfAnAuthorJoinsTheProfile() throws Exception {
        Admin ad = admin();
        Author a = author();
        long stories = count("SELECT COUNT(*) FROM dbo.Story WHERE AuthorId = ? AND IsDeleted = 0", a.authorId());

        JsonNode d = json(ad.client().get(USERS + "/" + a.authorId()).andExpect(status().isOk()));

        assertThat(d.get("role").asText()).isEqualTo("AUTHOR");
        assertThat(d.get("author").get("storyCount").asLong()).isEqualTo(stories);
        assertThat(d.get("authorRequests").get("approved").asInt()).isEqualTo(1);   // RB13
        assertThat(d.has("ban")).isFalse();
        ad.client().get(USERS + "/999999999").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    /** RB12: the session of a banned user dies at its next request; after unban the user can log in again. */
    @Test
    void banEndsTheSessionAndUnbanRestoresLogin() throws Exception {
        Admin ad = admin();
        Reader r = reader();
        r.client().get("/api/me").andExpect(status().isOk());

        JsonNode banned = json(ad.client().post(USERS + "/" + r.userId() + "/ban", Map.of("reason", "  Spam review. "))
                .andExpect(status().isOk()));
        assertThat(banned.get("status").asText()).isEqualTo("BANNED");
        assertThat(banned.get("ban").get("reason").asText()).isEqualTo("Spam review.");
        assertThat(banned.get("ban").get("by").get("userId").asInt()).isEqualTo(ad.adminId());

        r.client().get("/api/me").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_BANNED"));
        r.client().get("/api/me").andExpect(status().isUnauthorized());   // the session was destroyed
        ad.client().post(USERS + "/" + r.userId() + "/ban", Map.of("reason", "x")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));

        ad.client().post(USERS + "/" + r.userId() + "/unban", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        assertThat(count("SELECT COUNT(*) FROM dbo.[User] WHERE UserId = ? AND BanReason IS NULL AND BannedBy IS NULL "
                + "AND BannedAt IS NULL", r.userId())).isEqualTo(1);
        newClient().csrf().post("/api/auth/login", Map.of("login", r.username(), "password", PASSWORD))
                .andExpect(status().isOk());
        ad.client().post(USERS + "/" + r.userId() + "/unban", null).andExpect(status().isConflict());
    }

    /** D1, RB16. */
    @Test
    void administratorsCannotBeBanned() throws Exception {
        Admin ad = admin();
        int other = otherAdminId(ad.adminId());

        ad.client().post(USERS + "/" + ad.adminId() + "/ban", Map.of("reason", "x")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CANNOT_BAN_ADMIN"));
        ad.client().post(USERS + "/" + other + "/ban", Map.of("reason", "x")).andExpect(status().isForbidden());
        ad.client().post(USERS + "/" + ad.adminId() + "/ban", Map.of("reason", " ")).andExpect(status().isBadRequest());
        assertThat(count("SELECT COUNT(*) FROM dbo.[User] WHERE Role = 'ADMIN' AND Status = 'BANNED'")).isZero();
    }

    /** G2, D8. */
    @Test
    void createdAdministratorCanLogInAndAdminister() throws Exception {
        Admin ad = admin();
        String username = uniqueUsername();
        Map<String, Object> body = Map.of("username", username, "email", username + "@IT.novelle.test",
                "password", PASSWORD, "displayName", " Quản trị mới ");

        JsonNode created = json(ad.client().post(ADMIN + "/admins", body).andExpect(status().isCreated()));

        assertThat(created.get("role").asText()).isEqualTo("ADMIN");
        assertThat(created.has("lastLoginAt")).isFalse();
        assertThat(created.get("email").asText()).isEqualTo(username + "@it.novelle.test");
        Client c = newClient().csrf();
        c.post("/api/auth/login", Map.of("login", username, "password", PASSWORD)).andExpect(status().isOk());
        c.get(USERS).andExpect(status().isOk());

        ad.client().post(ADMIN + "/admins", body).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));
        ad.client().post(ADMIN + "/admins", Map.of("username", "A B", "email", "x", "password", "1", "displayName", ""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verifiedBadgeTogglesAndEvictsTheAuthorsStories() throws Exception {
        Admin ad = admin();
        Author a = author();
        boolean before = count("SELECT CAST(IsVerified AS INT) FROM dbo.Author WHERE UserId = ?", a.authorId()) == 1;
        int storyId = (int) count("SELECT TOP (1) StoryId FROM dbo.Story WHERE AuthorId = ? AND IsDeleted = 0",
                a.authorId());
        redis.opsForValue().set("cache:story:" + storyId, "{}");

        ad.client().patch(ADMIN + "/authors/" + a.authorId() + "/verify", Map.of("isVerified", !before))
                .andExpect(status().isOk()).andExpect(jsonPath("$.isVerified").value(!before));

        assertThat(count("SELECT CAST(IsVerified AS INT) FROM dbo.Author WHERE UserId = ?", a.authorId()))
                .isEqualTo(before ? 0 : 1);
        assertThat(redis.hasKey("cache:story:" + storyId)).isFalse();
        Reader r = reader();
        ad.client().patch(ADMIN + "/authors/" + r.userId() + "/verify", Map.of("isVerified", true))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("AUTHOR_NOT_FOUND"));
    }

    @Test
    void onlyAdministratorsWithCsrf() throws Exception {
        newClient().get(USERS).andExpect(status().isUnauthorized());
        reader().client().get(USERS).andExpect(status().isForbidden());
        author().client().get(USERS).andExpect(status().isForbidden());
        Admin ad = admin();
        ad.client().postWithoutCsrf(USERS + "/" + ad.adminId() + "/unban", null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }
}
