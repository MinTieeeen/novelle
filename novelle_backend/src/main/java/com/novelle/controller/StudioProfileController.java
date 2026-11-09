package com.novelle.controller;

import com.novelle.dto.AuthorProfileStudioResponse;
import com.novelle.dto.UpdateAuthorProfileRequest;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.AuthorProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** My author profile (S10, S11). AUTHOR only (SecurityConfig). */
@Tag(name = "Studio — stories")
@RestController
public class StudioProfileController {

    private final AuthorProfileService profileService;
    private final CurrentUser currentUser;

    public StudioProfileController(AuthorProfileService profileService, CurrentUser currentUser) {
        this.profileService = profileService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "My author profile")
    @GetMapping("/api/studio/profile")
    public AuthorProfileStudioResponse get() {
        return profileService.get(currentUser.requireId());
    }

    @Operation(summary = "Edit pen name (unique) and bio: null = unchanged, empty bio = cleared (CSRF)")
    @PatchMapping("/api/studio/profile")
    public AuthorProfileStudioResponse update(@Valid @RequestBody UpdateAuthorProfileRequest body) {
        return profileService.update(currentUser.requireId(), body);
    }
}
