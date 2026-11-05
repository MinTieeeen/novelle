package com.novelle.controller;

import com.novelle.dto.PublicProfileResponse;
import com.novelle.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public user pages. */
@Tag(name = "Users")
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final ProfileService profileService;

    public UserController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @Operation(summary = "Public profile of an active user")
    @GetMapping("/{username}")
    public PublicProfileResponse profile(@PathVariable String username) {
        return profileService.getPublicProfile(username);
    }
}
