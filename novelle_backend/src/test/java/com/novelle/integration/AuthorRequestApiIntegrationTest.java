package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/** Author requests, applicant side (M5: A1 GET me, A2 submit, A3 cancel). */
class AuthorRequestApiIntegrationTest extends LibraryIntegrationSupport {

    private static final String INTRO = "Tôi muốn viết một bộ truyện tiên hiệp dài khoảng 200 chương.";

    private static Map<String, Object> body(String penName, String intro) {
        return Map.of("proposedPenName", penName, "introduction", intro);
    }

    private static String penName() {
        return "IT Pen " + uniqueUsername().substring(3);
    }

    private int submit(Client c, String penName) throws Exception {
        return json(c.post("/api/author-requests", body(penName, INTRO)).andExpect(status().isCreated()))
                .get("requestId").asInt();
    }

    private String statusOf(int requestId) {
        return jdbc.queryForObject("SELECT Status FROM dbo.AuthorRequest WHERE RequestId = ?", String.class, requestId);
    }

    /* ---------- A2 submit ---------- */

    @Test
    void readerSubmitsAPendingRequest() throws Exception {
        Reader r = reader();
        String pen = penName();

        JsonNode res = json(r.client().post("/api/author-requests", body("  " + pen + " ", "  " + INTRO + " "))
                .andExpect(status().isCreated()));

        assertThat(res.get("status").asText()).isEqualTo("PENDING");
        assertThat(res.get("proposedPenName").asText()).isEqualTo(pen);
        assertThat(res.get("introduction").asText()).isEqualTo(INTRO);
        assertThat(res.get("createdAt").asText()).endsWith("Z");
        assertThat(res.has("reviewedAt")).isFalse();
        assertThat(res.has("reviewNote")).isFalse();
        Map<String, Object> row = row("SELECT UserId, Status, ReviewedBy FROM dbo.AuthorRequest WHERE RequestId = ?",
                res.get("requestId").asInt());
        assertThat(row.get("UserId")).isEqualTo(r.userId());
        assertThat(row.get("Status")).isEqualTo("PENDING");
        assertThat(row.get("ReviewedBy")).isNull();
    }

    @Test
    void secondRequestWhilePendingIsRejected() throws Exception {
        Reader r = reader();
        submit(r.client(), penName());

        r.client().post("/api/author-requests", body(penName(), INTRO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REQUEST_ALREADY_PENDING"));
        assertThat(count("SELECT COUNT(*) FROM dbo.AuthorRequest WHERE UserId = ?", r.userId())).isEqualTo(1);
    }

    @Test
    void penNameOfAnExistingAuthorIsTakenIgnoringCase() throws Exception {
        String existing = jdbc.queryForObject("SELECT TOP (1) PenName FROM dbo.Author ORDER BY UserId", String.class);
        Reader r = reader();

        r.client().post("/api/author-requests", body(existing.toUpperCase(), INTRO))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PEN_NAME_TAKEN"));
    }

    @Test
    void authorsAndAdminsCannotSubmit() throws Exception {
        for (String username : new String[] {seededActiveAuthor(), seededActiveAdmin()}) {
            loginAs(username).post("/api/author-requests", body(penName(), INTRO))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ONLY_READER_CAN_REQUEST"));
        }
    }

    /** One fresh reader per case: the limit 'author-request' allows only 3 submissions a day per user. */
    private void expectInvalid(Object body, String field) throws Exception {
        Reader r = reader();
        r.client().post("/api/author-requests", body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value(field));
        assertThat(count("SELECT COUNT(*) FROM dbo.AuthorRequest WHERE UserId = ?", r.userId())).isZero();
    }

    @Test
    void validationAfterTrimming() throws Exception {
        expectInvalid(body(" a ", INTRO), "proposedPenName");
        expectInvalid(body(penName(), "   quá ngắn         "), "introduction");
        expectInvalid(Map.of("introduction", INTRO), "proposedPenName");
        expectInvalid(body(penName(), "x".repeat(2001)), "introduction");
        reader().client().post("/api/author-requests", "{bad json").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void loginAndCsrfAreRequired() throws Exception {
        newClient().csrf().post("/api/author-requests", body(penName(), INTRO))
                .andExpect(status().isUnauthorized());
        newClient().get("/api/author-requests/me").andExpect(status().isUnauthorized());
        reader().client().postWithoutCsrf("/api/author-requests", body(penName(), INTRO))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
    }

    @Test
    void submittingIsRateLimitedPerUser() throws Exception {
        Reader r = reader();
        String key = "rl:author-request:u" + r.userId();
        // invalid bodies: the limiter runs before validation, so nothing is written
        for (int i = 0; i < 3; i++) {
            r.client().post("/api/author-requests", Map.of()).andExpect(status().isBadRequest());
        }
        r.client().post("/api/author-requests", Map.of())
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        assertThat(redis.getExpire(key)).isPositive().isLessThanOrEqualTo(86_400L);
    }

    /* ---------- A1 mine, A3 cancel ---------- */

    @Test
    void cancelThenSubmitAgainAndListNewestFirst() throws Exception {
        Reader r = reader();
        int first = submit(r.client(), penName());

        r.client().post("/api/author-requests/" + first + "/cancel", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertThat(statusOf(first)).isEqualTo("CANCELLED");

        int second = submit(r.client(), penName());
        JsonNode mine = json(r.client().get("/api/author-requests/me").andExpect(status().isOk()));
        assertThat(mine).hasSize(2);
        assertThat(mine.get(0).get("requestId").asInt()).isEqualTo(second);
        assertThat(mine.get(0).get("status").asText()).isEqualTo("PENDING");
        assertThat(mine.get(1).get("status").asText()).isEqualTo("CANCELLED");
    }

    @Test
    void cancellingTwiceIsAlreadyProcessed() throws Exception {
        Reader r = reader();
        int id = submit(r.client(), penName());
        r.client().post("/api/author-requests/" + id + "/cancel", null).andExpect(status().isOk());

        r.client().post("/api/author-requests/" + id + "/cancel", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));
    }

    @Test
    void cancellingSomeoneElsesRequestIsNotFound() throws Exception {
        Reader owner = reader();
        int id = submit(owner.client(), penName());

        reader().client().post("/api/author-requests/" + id + "/cancel", null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AUTHOR_REQUEST_NOT_FOUND"));
        reader().client().post("/api/author-requests/999999999/cancel", null)
                .andExpect(status().isNotFound());
        assertThat(statusOf(id)).isEqualTo("PENDING");
    }

    @Test
    void myRequestsIsEmptyForANewReader() throws Exception {
        assertThat(json(reader().client().get("/api/author-requests/me").andExpect(status().isOk()))).isEmpty();
    }
}
