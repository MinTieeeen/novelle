package com.novelle.controller;

import com.novelle.service.ModerationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Removal of offending reviews (F12, docs/module-admin.md C5). ADMIN only (SecurityConfig). */
@Tag(name = "Admin — content")
@RestController
public class AdminRatingController {

    private final ModerationService moderationService;

    public AdminRatingController(ModerationService moderationService) {
        this.moderationService = moderationService;
    }

    @Operation(summary = "Delete one user's rating of a story; the story rating is recomputed by trg_Rating (CSRF)")
    @DeleteMapping("/api/admin/ratings/{storyId}/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int storyId, @PathVariable int userId) {
        moderationService.deleteRating(storyId, userId);
    }
}
