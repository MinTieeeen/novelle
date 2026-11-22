package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/studio/stories/{id}/chapters (C2). {@code volumeId} null = no volume; {@code content} null =
 * empty chapter. The content length limit ({@code app.studio.content-max-length}) is checked by the service.
 */
public record CreateChapterRequest(
        @NotBlank @Size(max = 300) String title,
        Integer volumeId,
        String content) {
}
