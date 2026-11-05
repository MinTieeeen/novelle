package com.novelle.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** POST /api/auth/login. {@code login} is a username or an email. */
public record LoginRequest(
        @NotBlank @Size(max = 255) String login,
        @NotBlank @Size(max = 72) String password) {
}
