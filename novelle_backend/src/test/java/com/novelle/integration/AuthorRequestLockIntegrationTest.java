package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.Map;

import com.novelle.infrastructure.cache.LockKeys;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** The optional Redis lock of the author-request review (M5 D1), switched on for this class only. */
@TestPropertySource(properties = "app.author-request.redis-lock.enabled=true")
class AuthorRequestLockIntegrationTest extends LibraryIntegrationSupport {

    private int pendingRequest() throws Exception {
        Client c = reader().client();
        return json(c.post("/api/author-requests", Map.of("proposedPenName", "IT Pen " + uniqueUsername().substring(3),
                "introduction", "Tôi muốn viết một bộ truyện tiên hiệp dài khoảng 200 chương."))
                .andExpect(status().isCreated())).get("requestId").asInt();
    }

    @Test
    void lockHeldByAnotherAdminIsReviewInProgress() throws Exception {
        Client admin = loginAs(seededActiveAdmin());
        int id = pendingRequest();
        String key = LockKeys.authorRequest(id);
        redis.opsForValue().set(key, "other-admin", Duration.ofSeconds(5));

        admin.post("/api/admin/author-requests/" + id + "/approve", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REVIEW_IN_PROGRESS"));
        assertThat(redis.opsForValue().get(key)).isEqualTo("other-admin");     // someone else's lock is untouched
        assertThat(jdbc.queryForObject("SELECT Status FROM dbo.AuthorRequest WHERE RequestId = ?", String.class, id))
                .isEqualTo("PENDING");

        redis.delete(key);
        admin.post("/api/admin/author-requests/" + id + "/approve", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        assertThat(redis.hasKey(key)).isFalse();                               // released after the review
    }

    @Test
    void lockIsReleasedWhenTheReviewFails() throws Exception {
        Client admin = loginAs(seededActiveAdmin());
        int id = pendingRequest();
        admin.post("/api/admin/author-requests/" + id + "/reject", null).andExpect(status().isOk());

        admin.post("/api/admin/author-requests/" + id + "/approve", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));
        assertThat(redis.hasKey(LockKeys.authorRequest(id))).isFalse();
    }
}
