package com.novelle.controller;

import com.novelle.dto.ChangePasswordRequest;
import com.novelle.dto.MeResponse;
import com.novelle.dto.UpdateProfileRequest;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.infrastructure.security.SessionAuthenticator;
import com.novelle.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The logged-in user's own account. */
@Tag(name = "Me")
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final ProfileService profileService;
    private final CurrentUser currentUser;
    private final SessionAuthenticator sessionAuthenticator;

    public MeController(ProfileService profileService, CurrentUser currentUser,
            SessionAuthenticator sessionAuthenticator) {
        this.profileService = profileService;
        this.currentUser = currentUser;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @Operation(summary = "Current user, with the author profile when the role is AUTHOR")
    @GetMapping
    public MeResponse me() {
        return profileService.getMe(currentUser.requireId());
    }

    @Operation(summary = "Update display name and bio (send the rowVersion from GET /api/me)")
    @PatchMapping
    public MeResponse update(@Valid @RequestBody UpdateProfileRequest body) {
        return profileService.updateProfile(currentUser.requireId(), body);
    }

    @Operation(summary = "Change password (the session id is renewed)")
    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest body, HttpServletRequest request) {
        profileService.changePassword(currentUser.requireId(), body);
        sessionAuthenticator.rotateSessionId(request);
    }
}
