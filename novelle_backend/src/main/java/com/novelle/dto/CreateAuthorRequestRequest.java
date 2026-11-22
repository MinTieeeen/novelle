package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/author-requests. The service trims both fields and checks the minimum lengths after trimming
 * (pen name 2–100, introduction 20–2000; docs/module-author-request.md §7.5).
 */
public record CreateAuthorRequestRequest(
        @NotBlank @Size(max = 100) String proposedPenName,
        @NotBlank @Size(max = 2000) String introduction) {
}
