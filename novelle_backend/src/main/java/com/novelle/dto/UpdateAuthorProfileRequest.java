package com.novelle.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body of PATCH /api/studio/profile (S11). A null field is left unchanged; an empty {@code bio} clears it. */
public record UpdateAuthorProfileRequest(
        @Size(min = 2, max = 100) @Pattern(regexp = StudioPatterns.NOT_BLANK, message = "must not be blank")
        String penName,
        @Size(max = 2000) String bio) {
}
