package com.novelle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/admin/genres (G2). The slug comes from the name; {@code sortOrder} absent = 0. */
public record CreateGenreRequest(
        @NotBlank @Size(max = 50) String name,
        @Size(max = 500) String description,
        @Min(0) @Max(32000) Integer sortOrder) {
}
