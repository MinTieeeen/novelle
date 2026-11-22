package com.novelle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of PATCH /api/reading-lists/{listId}. A null field is left unchanged; an empty / blank {@code description}
 * clears it; {@code name}, when sent, must not be blank.
 */
public record UpdateReadingListRequest(
        @Size(max = 100) @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank") String name,
        @Size(max = 500) String description,
        @JsonProperty("isPublic") Boolean isPublic) {
}
