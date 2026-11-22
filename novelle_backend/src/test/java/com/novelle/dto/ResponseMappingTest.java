package com.novelle.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.novelle.infrastructure.mybatis.RowVersion;
import com.novelle.model.AppUser;
import com.novelle.model.AuthorSummary;
import org.junit.jupiter.api.Test;

class ResponseMappingTest {

    private final ObjectMapper json = JsonMapper.builder().findAndAddModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();

    @Test
    void meResponseTreatsDatabaseTimesAsUtc() {
        MeResponse me = MeResponse.from(user(null));
        assertThat(me.createdAt()).isEqualTo(Instant.parse("2026-01-02T03:04:05Z"));
        assertThat(me.lastLoginAt()).isNull();
        assertThat(me.author()).isNull();
    }

    @Test
    void authorBlockKeepsIsVerifiedName() throws Exception {
        AuthorSummary a = new AuthorSummary();
        a.setAuthorId(9);
        a.setPenName("Mộc Lan");
        a.setIsVerified(true);
        a.setFollowerCount(12);

        String me = json.writeValueAsString(MeResponse.from(user(a)));
        assertThat(me).contains("\"isVerified\":true").contains("\"penName\":\"Mộc Lan\"")
                .contains("\"createdAt\":\"2026-01-02T03:04:05Z\"").contains("\"rowVersion\":\"AAAAAAAAAAE=\"");

        String pub = json.writeValueAsString(PublicProfileResponse.from(user(a)));
        assertThat(pub).contains("\"authorId\":9").doesNotContain("email").doesNotContain("status")
                .doesNotContain("rowVersion");
    }

    private static AppUser user(AuthorSummary author) {
        AppUser u = new AppUser();
        u.setUserId(9);
        u.setUsername("u");
        u.setEmail("u@x.vn");
        u.setDisplayName("U");
        u.setRole(author == null ? "READER" : "AUTHOR");
        u.setStatus("ACTIVE");
        u.setCreatedAt(LocalDateTime.of(2026, 1, 2, 3, 4, 5));
        u.setRowVersion(new RowVersion(new byte[] {0, 0, 0, 0, 0, 0, 0, 1}));
        u.setAuthor(author);
        return u;
    }
}
