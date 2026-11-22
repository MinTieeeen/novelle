package com.novelle.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotNull;

/** Body of POST /api/studio/chapters/{id}/revisions/{no}/restore (R3): the chapter's current {@code version}. */
public record RestoreRevisionRequest(@NotNull Instant version) {
}
