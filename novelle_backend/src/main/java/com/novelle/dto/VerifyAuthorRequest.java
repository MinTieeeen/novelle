package com.novelle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

/** Body of PATCH /api/admin/authors/{id}/verify (U6). */
public record VerifyAuthorRequest(@JsonProperty("isVerified") @NotNull Boolean isVerified) {
}
