package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** A1-A4: CSRF token, register, login, logout. */
class AuthApiIntegrationTest extends ApiIntegrationTest {

    /* ---------- A1 csrf ---------- */

    @Test
    void csrfEndpointReturnsTokenAndCookie() throws Exception {
        Client c = newClient();
        c.get("/api/auth/csrf")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
                .andExpect(cookie().exists("XSRF-TOKEN"));
        assertThat(c.xsrf).isNotBlank();
    }

    /* ---------- A2 register ---------- */

    @Test
    void registerCreatesReaderAndLogsIn() throws Exception {
        Client c = newClient().csrf();
        String username = uniqueUsername();
        Map<String, Object> body = new HashMap<>(registration(username));
        body.put("email", username.toUpperCase() + "@IT.Novelle.TEST");

        c.post("/api/auth/register", body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value(username))
                .andExpect(jsonPath("$.email").value(username + "@it.novelle.test"))
                .andExpect(jsonPath("$.role").value("READER"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.rowVersion").isString())
                .andExpect(jsonPath("$.lastLoginAt").isString())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.author").doesNotExist());

        assertThat(c.session).isNotNull();
        assertThat(redis.hasKey(sessionKey(c.sessionId()))).isTrue();
        c.get("/api/me").andExpect(status().isOk()).andExpect(jsonPath("$.username").value(username));

        String hash = jdbc.queryForObject("SELECT PasswordHash FROM dbo.[User] WHERE Username = ?", String.class, username);
        assertThat(hash).startsWith("$2").isNotEqualTo(PASSWORD);
    }

    @Test
    void registerValidatesEveryField() throws Exception {
        Client c = newClient().csrf();
        c.post("/api/auth/register", Map.of("username", "Bad Name", "email", "not-an-email",
                        "password", "short", "displayName", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details[?(@.field == 'username')]").exists())
                .andExpect(jsonPath("$.details[?(@.field == 'email')]").exists())
                .andExpect(jsonPath("$.details[?(@.field == 'password')]").exists())
                .andExpect(jsonPath("$.details[?(@.field == 'displayName')]").exists());

        c.post("/api/auth/register", Map.of()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(4));
    }

    @Test
    void registerRejectsPasswordOver72BytesUtf8() throws Exception {
        Map<String, Object> body = new HashMap<>(registration(uniqueUsername()));
        body.put("password", "mậtkhẩu".repeat(9));            // 63 chars, more than 72 bytes
        newClient().csrf().post("/api/auth/register", body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("password"));
    }

    @Test
    void registerRejectsTakenUsernameAndEmail() throws Exception {
        String taken = registerReader(newClient());

        Map<String, Object> sameUsername = new HashMap<>(registration(taken));
        sameUsername.put("email", uniqueUsername() + "@it.novelle.test");
        newClient().csrf().post("/api/auth/register", sameUsername)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USERNAME_TAKEN"));

        Map<String, Object> sameEmail = new HashMap<>(registration(uniqueUsername()));
        sameEmail.put("email", taken.toUpperCase() + "@IT.NOVELLE.TEST");
        newClient().csrf().post("/api/auth/register", sameEmail)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
    }

    @Test
    void registerWithoutCsrfIsRejected() throws Exception {
        Client c = newClient().csrf();
        c.postWithoutCsrf("/api/auth/register", registration(uniqueUsername()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        newClient().postWithoutCsrf("/api/auth/register", registration(uniqueUsername()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    /* ---------- A3 login ---------- */

    @Test
    void loginByUsernameAndByEmail() throws Exception {
        String author = withKnownPassword(seededActiveAuthor());
        String email = jdbc.queryForObject("SELECT Email FROM dbo.[User] WHERE Username = ?", String.class, author);

        newClient().csrf().post("/api/auth/login", Map.of("login", author, "password", PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(author))
                .andExpect(jsonPath("$.role").value("AUTHOR"))
                .andExpect(jsonPath("$.author.penName").isString());

        newClient().csrf().post("/api/auth/login", Map.of("login", "  " + email.toUpperCase() + " ", "password", PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(author));

        Timestamp last = jdbc.queryForObject("SELECT LastLoginAt FROM dbo.[User] WHERE Username = ?",
                Timestamp.class, author);
        Instant lastUtc = last.toLocalDateTime().toInstant(java.time.ZoneOffset.UTC);
        assertThat(Duration.between(lastUtc, Instant.now()).abs()).isLessThan(Duration.ofMinutes(5));
    }

    @Test
    void wrongPasswordAndUnknownUserGiveTheSameAnswer() throws Exception {
        String author = withKnownPassword(seededActiveAuthor());
        Client c = newClient().csrf();

        String wrong = c.post("/api/auth/login", Map.of("login", author, "password", "Wrong-pass1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();
        String unknown = c.post("/api/auth/login", Map.of("login", uniqueUsername(), "password", "Wrong-pass1"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        assertThat(unknown).isEqualTo(wrong);
        assertThat(c.session).isNull();
    }

    @Test
    void loginValidatesBodyAndJson() throws Exception {
        Client c = newClient().csrf();
        c.post("/api/auth/login", Map.of("login", "", "password", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        c.post("/api/auth/login", "{not json")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void bannedUserCannotLogIn() throws Exception {
        String banned = withKnownPassword(seededBannedUser());
        String reason = jdbc.queryForObject("SELECT BanReason FROM dbo.[User] WHERE Username = ?", String.class, banned);
        Client c = newClient().csrf();

        c.post("/api/auth/login", Map.of("login", banned, "password", PASSWORD))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCOUNT_BANNED"))
                .andExpect(jsonPath("$.details.banReason").value(reason));
        c.post("/api/auth/login", Map.of("login", banned, "password", "Wrong-pass1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        assertThat(c.session).isNull();
    }

    @Test
    void loggingInAgainRenewsTheSessionId() throws Exception {
        String author = withKnownPassword(seededActiveAuthor());
        Client c = newClient().csrf();
        c.post("/api/auth/login", Map.of("login", author, "password", PASSWORD)).andExpect(status().isOk());
        String first = c.sessionId();

        c.post("/api/auth/login", Map.of("login", author, "password", PASSWORD)).andExpect(status().isOk());

        assertThat(c.sessionId()).isNotEqualTo(first);
        assertThat(redis.hasKey(sessionKey(first))).isFalse();
        c.get("/api/me").andExpect(status().isOk());
    }

    /* ---------- A4 logout ---------- */

    @Test
    void logoutDestroysTheSession() throws Exception {
        Client c = newClient();
        registerReader(c);
        String sessionId = c.sessionId();

        c.post("/api/auth/logout", null).andExpect(status().isNoContent());

        assertThat(c.session).isNull();
        assertThat(redis.hasKey(sessionKey(sessionId))).isFalse();
        c.get("/api/me").andExpect(status().isUnauthorized());
    }

    @Test
    void logoutWhenAnonymousIsHarmlessButNeedsCsrf() throws Exception {
        Client c = newClient();
        c.postWithoutCsrf("/api/auth/logout", null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        c.csrf().post("/api/auth/logout", null).andExpect(status().isNoContent());
    }
}
