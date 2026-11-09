package com.novelle.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of PUT /api/studio/chapters/{id} (C6), a full replacement: {@code volumeId} null = the chapter belongs to
 * no volume. {@code version} is the chapter's {@code version} as last read (D4).
 */
public record SaveChapterRequest(
        @NotBlank @Size(max = 300) String title,
        @NotNull String content,
        Integer volumeId,
        @NotNull Instant version) {
}
