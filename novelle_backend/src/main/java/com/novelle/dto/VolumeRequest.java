package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/studio/stories/{id}/volumes (V2) and PATCH /api/studio/volumes/{id} (V3). */
public record VolumeRequest(@NotBlank @Size(max = 200) String title) {
}
