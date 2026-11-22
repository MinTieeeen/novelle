package com.novelle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Result of PATCH /api/admin/authors/{id}/verify (U6). */
public record AuthorVerifyResponse(int authorId, @JsonProperty("isVerified") boolean isVerified) {
}
