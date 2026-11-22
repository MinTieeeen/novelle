package com.novelle.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body of PATCH /api/admin/tags/{id} (T2); normalised like story tags (trimmed, spaces collapsed, 2–50). */
public record RenameTagRequest(@NotNull @Size(max = 100) String name) {
}
