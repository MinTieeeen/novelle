package com.novelle.controller;

import com.novelle.dto.CreateStoryRequest;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryGenresRequest;
import com.novelle.dto.StoryTagsRequest;
import com.novelle.dto.StudioStoryCardResponse;
import com.novelle.dto.StudioStoryResponse;
import com.novelle.dto.UpdateStoryRequest;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.StudioStoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * My stories (F8, docs/module-studio.md S1–S9). {@code /api/studio/**} is AUTHOR only (SecurityConfig); the service
 * answers 404 for a story that is not mine.
 */
@Tag(name = "Studio — stories")
@RestController
@RequestMapping("/api/studio/stories")
public class StudioStoryController {

    private final StudioStoryService storyService;
    private final CurrentUser currentUser;

    public StudioStoryController(StudioStoryService storyService, CurrentUser currentUser) {
        this.storyService = storyService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "My stories (any status except deleted), most recently changed first")
    @GetMapping
    public PageResponse<StudioStoryCardResponse> page(@RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return storyService.page(currentUser.requireId(), status, page, size);
    }

    @Operation(summary = "Create a DRAFT story with 1–3 genres and up to 10 tags (rate limit story-create; CSRF)")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RateLimited(value = "story-create", scope = RateLimited.Scope.USER)
    public StudioStoryResponse create(@Valid @RequestBody CreateStoryRequest body) {
        return storyService.create(currentUser.requireId(), body);
    }

    @Operation(summary = "One of my stories for editing, with its version")
    @GetMapping("/{storyId}")
    public StudioStoryResponse get(@PathVariable int storyId) {
        return storyService.get(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Edit story info: null = unchanged, empty description / cover = cleared; "
            + "an old version gives 409 STALE_DATA (CSRF)")
    @PatchMapping("/{storyId}")
    public StudioStoryResponse update(@PathVariable int storyId, @Valid @RequestBody UpdateStoryRequest body) {
        return storyService.update(currentUser.requireId(), storyId, body);
    }

    @Operation(summary = "Replace the genres: 1–3, exactly one primary (CSRF)")
    @PutMapping("/{storyId}/genres")
    public StudioStoryResponse replaceGenres(@PathVariable int storyId,
            @Valid @RequestBody StoryGenresRequest body) {
        return storyService.replaceGenres(currentUser.requireId(), storyId, body);
    }

    @Operation(summary = "Replace the tags: at most 10 after merging duplicates; unknown tags are created (CSRF)")
    @PutMapping("/{storyId}/tags")
    public StudioStoryResponse replaceTags(@PathVariable int storyId, @Valid @RequestBody StoryTagsRequest body) {
        return storyService.replaceTags(currentUser.requireId(), storyId, body.tags());
    }

    @Operation(summary = "DRAFT → PUBLISHED; needs a published chapter; not allowed when HIDDEN (CSRF)")
    @PostMapping("/{storyId}/publish")
    public StudioStoryResponse publish(@PathVariable int storyId) {
        return storyService.publish(currentUser.requireId(), storyId);
    }

    @Operation(summary = "PUBLISHED → DRAFT; not allowed when HIDDEN (CSRF)")
    @PostMapping("/{storyId}/unpublish")
    public StudioStoryResponse unpublish(@PathVariable int storyId) {
        return storyService.unpublish(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Soft-delete my story (sp_DeleteStory; CSRF)")
    @DeleteMapping("/{storyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int storyId) {
        storyService.delete(currentUser.requireId(), storyId);
    }
}
