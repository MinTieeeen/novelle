package com.novelle.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body of PUT /api/studio/chapters/{id}/draft (C4), the editor autosave. The title may still be empty. */
public record DraftRequest(
        @NotNull @Size(max = 300) String title,
        @NotNull String content) {
}
