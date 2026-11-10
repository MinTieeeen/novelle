package com.novelle.controller;

import com.novelle.dto.AdminStoryItemResponse;
import com.novelle.dto.HideStoryRequest;
import com.novelle.dto.PageResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.ModerationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Story moderation (F12, docs/module-admin.md C1–C4). ADMIN only (SecurityConfig). */
@Tag(name = "Admin — content")
@RestController
@RequestMapping("/api/admin/stories")
public class AdminStoryController {

    private final ModerationService moderationService;
    private final CurrentUser currentUser;

    public AdminStoryController(ModerationService moderationService, CurrentUser currentUser) {
        this.moderationService = moderationService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Every story that is not deleted (drafts and hidden ones too), filtered by status, title "
            + "and author, most recently changed first")
    @GetMapping
    public PageResponse<AdminStoryItemResponse> page(@RequestParam(required = false) String publishStatus,
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer authorId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return moderationService.page(publishStatus, q, authorId, page, size);
    }

    @Operation(summary = "Hide a published story with a reason; it disappears from the public pages at once (CSRF)")
    @PostMapping("/{storyId}/hide")
    public AdminStoryItemResponse hide(@PathVariable int storyId, @Valid @RequestBody HideStoryRequest body) {
        return moderationService.hide(storyId, body.reason());
    }

    @Operation(summary = "Make a hidden story public again (CSRF)")
    @PostMapping("/{storyId}/unhide")
    public AdminStoryItemResponse unhide(@PathVariable int storyId) {
        return moderationService.unhide(storyId);
    }

    @Operation(summary = "Soft-delete any story (sp_DeleteStory; CSRF)")
    @DeleteMapping("/{storyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int storyId) {
        moderationService.delete(currentUser.requireId(), storyId);
    }
}
