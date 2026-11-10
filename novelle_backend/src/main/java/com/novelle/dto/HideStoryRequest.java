package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/admin/stories/{id}/hide (C2); the reason is shown to the author (Story.HiddenReason). */
public record HideStoryRequest(@NotBlank @Size(max = 500) String reason) {
}
