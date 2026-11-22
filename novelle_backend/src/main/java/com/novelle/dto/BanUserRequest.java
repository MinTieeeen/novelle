package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body of POST /api/admin/users/{id}/ban (U3); the reason is shown to other administrators and stored. */
public record BanUserRequest(@NotBlank @Size(max = 500) String reason) {
}
