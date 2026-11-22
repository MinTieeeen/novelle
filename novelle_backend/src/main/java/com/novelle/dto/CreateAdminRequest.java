package com.novelle.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** POST /api/admin/admins (U5, G2): same rules as registration (RegisterRequest, CK_User_Username). */
public record CreateAdminRequest(
        @NotBlank
        @Pattern(regexp = "^[a-z0-9_]{3,50}$", message = "3-50 characters: lowercase letters, digits, underscore")
        String username,

        @NotBlank @Email @Size(max = 255)
        String email,

        @NotBlank @Size(min = 8, max = 72)
        String password,

        @NotBlank @Size(max = 100)
        String displayName) {
}
