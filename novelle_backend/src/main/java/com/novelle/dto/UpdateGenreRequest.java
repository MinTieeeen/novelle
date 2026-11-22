package com.novelle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body of PATCH /api/admin/genres/{id} (G3). A null field is left unchanged; an empty {@code description} clears
 * it. The slug never changes, so genre filter links keep working.
 */
public record UpdateGenreRequest(
        @Size(max = 50) @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank") String name,
        @Size(max = 500) String description,
        @Min(0) @Max(32000) Integer sortOrder) {

    public boolean hasChanges() {
        return name != null || description != null || sortOrder != null;
    }
}
