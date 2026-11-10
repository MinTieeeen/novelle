package com.novelle.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotNull;

/** Body of POST /api/studio/chapters/{id}/schedule (C8); the allowed window is checked by the service. */
public record ScheduleChapterRequest(@NotNull Instant scheduledAt) {
}
