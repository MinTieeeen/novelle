package com.novelle.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

/**
 * Author requests, admin side (M5: A4 queue, A5 detail, A6 approve, A7 reject). The procedures run inside the test
 * transaction (their BEGIN / COMMIT only nest), so the rollback removes the approvals too.
 */
class AdminAuthorRequestApiIntegrationTest extends LibraryIntegrationSupport {

    private static final String INTRO = "Tôi muốn viết một bộ truyện tiên hiệp dài khoảng 200 chương.";
    private static final String BASE = "/api/admin/author-requests";

    private Client admin() throws Exception {
        return loginAs(seededActiveAdmin());
    }

    private static String penName() {
        return "IT Pen " + uniqueUsername().substring(3);
    }

    private int submit(Client c, String penName) throws Exception {
        return json(c.post("/api/author-requests", Map.of("proposedPenName", penName, "introduction", INTRO))
                .andExpect(status().isCreated())).get("requestId").asInt();
    }

    /* ---------- A4 queue, A5 detail ---------- */

    @Test
    void pendingQueueIsOldestFirstAndMatchesTheDatabase() throws Exception {
        JsonNode page = json(admin().get(BASE + "?size=50").andExpect(status().isOk()));

        assertThat(page.get("totalElements").asLong())
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.AuthorRequest WHERE Status = 'PENDING'"));
        Instant previous = Instant.MIN;
        for (JsonNode item : page.get("items")) {
            assertThat(item.get("status").asText()).isEqualTo("PENDING");
            assertThat(item.get("applicant").get("username").asText()).isNotBlank();
            Instant created = Instant.parse(item.get("createdAt").asText());
            assertThat(created).isAfterOrEqualTo(previous);
            previous = created;
        }
    }

    @Test
    void statusFilterAndValidation() throws Exception {
        Client admin = admin();
        JsonNode approved = json(admin.get(BASE + "?status=approved&size=5").andExpect(status().isOk()));
        assertThat(approved.get("totalElements").asLong())
                .isEqualTo(count("SELECT COUNT(*) FROM dbo.AuthorRequest WHERE Status = 'APPROVED'"));
        approved.get("items").forEach(i -> assertThat(i.get("status").asText()).isEqualTo("APPROVED"));

        JsonNode all = json(admin.get(BASE + "?status=ALL&size=1").andExpect(status().isOk()));
        assertThat(all.get("totalElements").asLong()).isEqualTo(count("SELECT COUNT(*) FROM dbo.AuthorRequest"));

        admin.get(BASE + "?status=DONE").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("status"));
        admin.get(BASE + "?size=0").andExpect(status().isBadRequest());
    }

    @Test
    void previouslyRejectedFlagAndOtherRequestCounts() throws Exception {
        Client admin = admin();
        Reader r = reader();
        int first = submit(r.client(), penName());
        admin.post(BASE + "/" + first + "/reject", Map.of("note", "Giới thiệu quá ngắn.")).andExpect(status().isOk());
        int second = submit(r.client(), penName());

        long total = count("SELECT COUNT(*) FROM dbo.AuthorRequest WHERE Status = 'PENDING'");
        long lastPage = (total - 1) / 50;
        JsonNode items = json(admin.get(BASE + "?size=50&page=" + lastPage).andExpect(status().isOk())).get("items");
        JsonNode mine = items.get(items.size() - 1);              // newest pending request = last in the queue
        assertThat(mine.get("requestId").asInt()).isEqualTo(second);
        assertThat(mine.get("previouslyRejected").asBoolean()).isTrue();

        JsonNode detail = json(admin.get(BASE + "/" + second).andExpect(status().isOk()));
        assertThat(detail.get("otherRequests").get("rejected").asInt()).isEqualTo(1);
        assertThat(detail.get("otherRequests").get("pending").asInt()).isZero();
        assertThat(detail.get("applicant").get("username").asText()).isEqualTo(r.username());
        assertThat(detail.get("applicant").get("role").asText()).isEqualTo("READER");
        assertThat(detail.get("applicant").get("email").asText()).contains("@");
        assertThat(detail.has("reviewer")).isFalse();
    }

    @Test
    void unknownRequestIsNotFound() throws Exception {
        Client admin = admin();
        admin.get(BASE + "/999999999").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AUTHOR_REQUEST_NOT_FOUND"));
        admin.post(BASE + "/999999999/approve", null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("AUTHOR_REQUEST_NOT_FOUND"));
    }

    /* ---------- A6 approve ---------- */

    @Test
    void approvalMakesTheApplicantAnAuthorOnTheirNextRequest() throws Exception {
        Client admin = admin();
        Reader r = reader();
        String pen = penName();
        int id = submit(r.client(), pen);

        JsonNode res = json(admin.post(BASE + "/" + id + "/approve", null).andExpect(status().isOk()));

        assertThat(res.get("status").asText()).isEqualTo("APPROVED");
        assertThat(res.get("applicant").get("role").asText()).isEqualTo("AUTHOR");
        assertThat(res.get("reviewer").get("username").asText()).isEqualTo(seededActiveAdmin());
        assertThat(res.get("reviewedAt").asText()).endsWith("Z");
        Map<String, Object> author = row("SELECT PenName, ApprovedRequestId FROM dbo.Author WHERE UserId = ?", r.userId());
        assertThat(author.get("PenName")).isEqualTo(pen);
        assertThat(author.get("ApprovedRequestId")).isEqualTo(id);

        // the applicant keeps the old session: UserStatusFilter picks up the new role
        r.client().get("/api/me").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("AUTHOR"));
        r.client().get("/api/studio/stories").andExpect(result ->
                assertThat(result.getResponse().getStatus()).isNotEqualTo(403));
    }

    @Test
    void secondDecisionIsAlreadyProcessed() throws Exception {
        Client admin = admin();
        int id = submit(reader().client(), penName());
        admin.post(BASE + "/" + id + "/approve", null).andExpect(status().isOk());

        admin.post(BASE + "/" + id + "/approve", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));
        admin.post(BASE + "/" + id + "/reject", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PROCESSED"));
    }

    /**
     * Two pending requests may propose the same pen name (D4): the second approval reaches the procedure, which
     * throws 50003. Its CATCH rolls back the whole test transaction, so only the response is asserted.
     */
    @Test
    void penNameTakenWhileWaitingIsRejectedByTheProcedure() throws Exception {
        Client admin = admin();
        String pen = penName();
        int a = submit(reader().client(), pen);
        int b = submit(reader().client(), pen);
        admin.post(BASE + "/" + a + "/approve", null).andExpect(status().isOk());

        admin.post(BASE + "/" + b + "/approve", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PEN_NAME_TAKEN"));
    }

    /* ---------- A7 reject ---------- */

    @Test
    void rejectWithANoteIsVisibleToTheApplicant() throws Exception {
        Client admin = admin();
        Reader r = reader();
        int id = submit(r.client(), penName());

        admin.post(BASE + "/" + id + "/reject", Map.of("note", "  Hãy nêu kế hoạch sáng tác. "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.reviewNote").value("Hãy nêu kế hoạch sáng tác."))
                .andExpect(jsonPath("$.applicant.role").value("READER"));

        r.client().get("/api/author-requests/me").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("REJECTED"))
                .andExpect(jsonPath("$[0].reviewNote").value("Hãy nêu kế hoạch sáng tác."));
        assertThat(count("SELECT COUNT(*) FROM dbo.Author WHERE UserId = ?", r.userId())).isZero();
        // a rejected reader may ask again
        submit(r.client(), penName());
    }

    @Test
    void rejectWithoutBodyHasNoNote() throws Exception {
        Client admin = admin();
        int id = submit(reader().client(), penName());

        JsonNode res = json(admin.post(BASE + "/" + id + "/reject", null).andExpect(status().isOk()));

        assertThat(res.get("status").asText()).isEqualTo("REJECTED");
        assertThat(res.has("reviewNote")).isFalse();
    }

    @Test
    void rejectNoteIsLimitedTo500() throws Exception {
        Client admin = admin();
        int id = submit(reader().client(), penName());

        admin.post(BASE + "/" + id + "/reject", Map.of("note", "x".repeat(501)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("note"));
    }

    /* ---------- security ---------- */

    @Test
    void onlyAdminsMayReview() throws Exception {
        Reader r = reader();
        int id = submit(r.client(), penName());

        r.client().get(BASE).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        r.client().post(BASE + "/" + id + "/approve", null).andExpect(status().isForbidden());
        loginAs(seededActiveAuthor()).get(BASE).andExpect(status().isForbidden());
        newClient().perform(get(BASE)).andExpect(status().isUnauthorized());
        admin().postWithoutCsrf(BASE + "/" + id + "/approve", null)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        assertThat(jdbc.queryForObject("SELECT Status FROM dbo.AuthorRequest WHERE RequestId = ?", String.class, id))
                .isEqualTo("PENDING");
    }
}
