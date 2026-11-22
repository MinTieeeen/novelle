package com.novelle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/reading-lists. Strings are trimmed by the service; {@code isPublic} absent = private. */
public record CreateReadingListRequest(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description,
        @JsonProperty("isPublic") Boolean isPublic) {
}
