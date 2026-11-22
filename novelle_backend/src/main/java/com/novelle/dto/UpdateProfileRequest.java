package com.novelle.dto;

import com.novelle.infrastructure.mybatis.RowVersion;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * PATCH /api/me. A null field is left unchanged; an empty {@code bio} clears it.
 * {@code rowVersion} is the value last read from GET /api/me (optimistic lock).
 */
public record UpdateProfileRequest(
        @Size(max = 100) @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank")
        String displayName,

        @Size(max = 1000)
        String bio,

        @NotNull
        RowVersion rowVersion) {
}
