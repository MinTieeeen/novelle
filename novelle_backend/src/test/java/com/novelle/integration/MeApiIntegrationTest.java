package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** U1-U3: own profile, profile update with optimistic locking, password change. */
class MeApiIntegrationTest extends ApiIntegrationTest {

    /* ---------- U1 ---------- */

    @Test
    void meRequiresLogin() throws Exception {
        newClient().get("/api/me")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void meOfAuthorIncludesAuthorProfile() throws Exception {
        String author = withKnownPassword(seededActiveAuthor());
        Client c = newClient().csrf();
        c.post("/api/auth/login", Map.of("login", author, "password", PASSWORD)).andExpect(status().isOk());

        c.get("/api/me")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("AUTHOR"))
                .andExpect(jsonPath("$.author.penName").isString())
                .andExpect(jsonPath("$.author.isVerified").isBoolean())
                .andExpect(jsonPath("$.author.followerCount").isNumber())
                .andExpect(jsonPath("$.createdAt").value(org.hamcrest.Matchers.endsWith("Z")));
    }

    /* ---------- U2 ---------- */

    @Test
    void updateProfileTrimsAndReturnsNewRowVersion() throws Exception {
        Client c = newClient();
        String username = registerReader(c);
        String rv = json(c.get("/api/me")).get("rowVersion").asText();

        JsonNode updated = json(c.patch("/api/me", Map.of("displayName", "  Tên mới  ", "bio", " Thích tiên hiệp ",
                        "rowVersion", rv))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Tên mới"))
                .andExpect(jsonPath("$.bio").value("Thích tiên hiệp")));

        assertThat(updated.get("rowVersion").asText()).isNotEqualTo(rv);
        assertThat(jdbc.queryForObject("SELECT DisplayName FROM dbo.[User] WHERE Username = ?", String.class, username))
                .isEqualTo("Tên mới");
    }

    @Test
    void omittedFieldsStayAndEmptyBioClears() throws Exception {
        Client c = newClient();
        registerReader(c);
        String rv = json(c.get("/api/me")).get("rowVersion").asText();
        rv = json(c.patch("/api/me", Map.of("bio", "Có bio", "rowVersion", rv)).andExpect(status().isOk()))
                .get("rowVersion").asText();

        Map<String, Object> onlyName = new HashMap<>();
        onlyName.put("displayName", "Chỉ đổi tên");
        onlyName.put("bio", null);
        onlyName.put("rowVersion", rv);
        rv = json(c.patch("/api/me", onlyName)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bio").value("Có bio")))
                .get("rowVersion").asText();

        c.patch("/api/me", Map.of("bio", "", "rowVersion", rv))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bio").doesNotExist())
                .andExpect(jsonPath("$.displayName").value("Chỉ đổi tên"));
    }

    @Test
    void staleRowVersionIsConflict() throws Exception {
        Client c = newClient();
        registerReader(c);
        String rv = json(c.get("/api/me")).get("rowVersion").asText();

        c.patch("/api/me", Map.of("displayName", "Tab 1", "rowVersion", rv)).andExpect(status().isOk());
        c.patch("/api/me", Map.of("bio", "Tab 2", "rowVersion", rv))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_DATA"));
        c.get("/api/me").andExpect(jsonPath("$.displayName").value("Tab 1"))
                .andExpect(jsonPath("$.bio").doesNotExist());
    }

    @Test
    void updateProfileValidation() throws Exception {
        Client c = newClient();
        registerReader(c);
        String rv = json(c.get("/api/me")).get("rowVersion").asText();

        c.patch("/api/me", Map.of("displayName", "X"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("rowVersion"));
        c.patch("/api/me", Map.of("displayName", "   ", "rowVersion", rv))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("displayName"));
        c.patch("/api/me", Map.of("bio", "x".repeat(1001), "rowVersion", rv))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("bio"));
        c.patch("/api/me", Map.of("displayName", "X", "rowVersion", "not-base64!"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void updateProfileNeedsLoginAndCsrf() throws Exception {
        newClient().csrf().patch("/api/me", Map.of("displayName", "X", "rowVersion", "AAAAAAAAAAE="))
                .andExpect(status().isUnauthorized());
        Client c = newClient();
        registerReader(c);
        c.patchWithoutCsrf("/api/me", Map.of("displayName", "X", "rowVersion", "AAAAAAAAAAE="))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    /* ---------- U3 ---------- */

    @Test
    void changePasswordFlow() throws Exception {
        Client c = newClient();
        String username = registerReader(c);
        String before = c.sessionId();

        c.put("/api/me/password", Map.of("currentPassword", "Wrong-pass1", "newPassword", "New-Passw0rd"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRONG_PASSWORD"));
        c.put("/api/me/password", Map.of("currentPassword", PASSWORD, "newPassword", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("newPassword"));

        c.put("/api/me/password", Map.of("currentPassword", PASSWORD, "newPassword", "New-Passw0rd"))
                .andExpect(status().isNoContent());
        assertThat(c.sessionId()).isNotEqualTo(before);
        c.get("/api/me").andExpect(status().isOk());

        Client other = newClient().csrf();
        other.post("/api/auth/login", Map.of("login", username, "password", PASSWORD))
                .andExpect(status().isUnauthorized());
        other.post("/api/auth/login", Map.of("login", username, "password", "New-Passw0rd"))
                .andExpect(status().isOk());
    }

    @Test
    void changePasswordRequiresLogin() throws Exception {
        newClient().csrf().put("/api/me/password", Map.of("currentPassword", "a", "newPassword", "New-Passw0rd"))
                .andExpect(status().isUnauthorized());
    }
}
