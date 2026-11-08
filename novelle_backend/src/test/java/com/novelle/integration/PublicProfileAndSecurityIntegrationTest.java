package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.Map;

import com.novelle.infrastructure.ratelimit.RateLimitProperties;
import com.novelle.infrastructure.ratelimit.RateLimitService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** U4 public profile, UserStatusFilter, rate limiting and the shared error format. */
class PublicProfileAndSecurityIntegrationTest extends ApiIntegrationTest {

    @Autowired
    private RateLimitService rateLimitService;

    /* ---------- U4 ---------- */

    @Test
    void publicProfileOfAuthorHidesPrivateFields() throws Exception {
        String author = seededActiveAuthor();
        newClient().get("/api/users/" + author)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(author))
                .andExpect(jsonPath("$.author.authorId").isNumber())
                .andExpect(jsonPath("$.author.penName").isString())
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.rowVersion").doesNotExist())
                .andExpect(jsonPath("$.lastLoginAt").doesNotExist());
    }

    @Test
    void publicProfileOfReaderHasNoAuthorBlock() throws Exception {
        Client c = newClient();
        String reader = registerReader(c);
        newClient().get("/api/users/" + reader)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("READER"))
                .andExpect(jsonPath("$.author").doesNotExist());
    }

    @Test
    void bannedOrUnknownUserHasNoPublicProfile() throws Exception {
        newClient().get("/api/users/" + seededBannedUser())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
        newClient().get("/api/users/" + uniqueUsername())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));
    }

    /* ---------- UserStatusFilter ---------- */

    @Test
    void userBannedDuringSessionIsLoggedOut() throws Exception {
        Client c = newClient();
        String username = registerReader(c);
        String sessionId = c.sessionId();
        c.get("/api/me").andExpect(status().isOk());

        sql("UPDATE dbo.[User] SET Status = 'BANNED', BanReason = N'IT ban', BannedAt = SYSUTCDATETIME() "
                + "WHERE Username = ?", username);

        c.get("/api/me")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCOUNT_BANNED"))
                .andExpect(jsonPath("$.details.banReason").value("IT ban"));
        assertThat(redis.hasKey(sessionKey(sessionId))).isFalse();
        c.get("/api/me").andExpect(status().isUnauthorized());
    }

    @Test
    void roleChangeAppliesWithoutNewLogin() throws Exception {
        Client c = newClient();
        String username = registerReader(c);

        c.get("/api/studio/anything")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        sql("UPDATE dbo.[User] SET Role = 'AUTHOR' WHERE Username = ?", username);

        // passes the AUTHOR rule now; no studio controller exists yet, so 404
        c.get("/api/studio/anything")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        c.get("/api/me").andExpect(jsonPath("$.role").value("AUTHOR"));
        c.get("/api/admin/anything").andExpect(status().isForbidden());
    }

    /* ---------- rate limiting ---------- */

    @Test
    void loginIsLimitedPerIp() throws Exception {
        Client c = newClient().csrf();
        for (int i = 0; i < 10; i++) {
            c.post("/api/auth/login", Map.of()).andExpect(status().isBadRequest());
        }
        c.post("/api/auth/login", Map.of())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
                .andExpect(jsonPath("$.details.retryAfterSeconds").isNumber())
                .andExpect(header().exists("Retry-After"));

        long seconds = Long.parseLong(c.post("/api/auth/login", Map.of()).andReturn().getResponse()
                .getHeader("Retry-After"));
        assertThat(seconds).isBetween(1L, 60L);
        assertThat(redis.getExpire("rl:login:" + c.ip)).isBetween(1L, 60L);

        newClient().csrf().post("/api/auth/login", Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void registerIsLimitedPerIp() throws Exception {
        Client c = newClient().csrf();
        for (int i = 0; i < 5; i++) {
            c.post("/api/auth/register", Map.of()).andExpect(status().isBadRequest());
        }
        c.post("/api/auth/register", Map.of()).andExpect(status().isTooManyRequests());
        assertThat(redis.getExpire("rl:register:" + c.ip)).isBetween(3500L, 3600L);
    }

    @Test
    void unlimitedEndpointsAreNotCounted() throws Exception {
        Client c = newClient();
        for (int i = 0; i < 12; i++) {
            c.get("/api/users/" + uniqueUsername()).andExpect(status().isNotFound());
        }
        assertThat(redis.keys("rl:*:" + c.ip)).isEmpty();
    }

    @Test
    void rateLimitWindowExpiresInRedis() throws Exception {
        String key = "rl:it-window:" + uniqueUsername();
        RateLimitProperties.Limit limit = new RateLimitProperties.Limit(2, Duration.ofMillis(800));
        try {
            assertThat(rateLimitService.hit(key, limit).allowed()).isTrue();
            assertThat(rateLimitService.hit(key, limit).allowed()).isTrue();
            RateLimitService.Decision third = rateLimitService.hit(key, limit);
            assertThat(third.allowed()).isFalse();
            assertThat(third.retryAfter()).isLessThanOrEqualTo(Duration.ofMillis(800));

            Thread.sleep(1000);
            RateLimitService.Decision fresh = rateLimitService.hit(key, limit);
            assertThat(fresh.allowed()).isTrue();
            assertThat(fresh.count()).isEqualTo(1);
        } finally {
            redis.delete(key);
        }
    }

    /* ---------- shared error format ---------- */

    @Test
    void securityAndMvcErrorsAreApiErrorJson() throws Exception {
        Client anonymous = newClient();
        anonymous.get("/api/whatever")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        anonymous.get("/api/auth/login")
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));

        Client reader = newClient();
        registerReader(reader);
        reader.get("/api/whatever")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        reader.get("/api/admin/users")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void healthIsPublic() throws Exception {
        newClient().get("/actuator/health").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }
}
