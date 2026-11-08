package com.novelle.controller;

import com.novelle.dto.ReadingProgressRequest;
import com.novelle.dto.ReadingProgressResponse;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.ReadingProgressService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reading position of the current user per story (RB5). Login required (anyRequest().authenticated()). */
@Tag(name = "Reading")
@RestController
@RequestMapping("/api/reading-progress")
public class ReadingProgressController {

    private final ReadingProgressService readingProgressService;
    private final CurrentUser currentUser;

    public ReadingProgressController(ReadingProgressService readingProgressService, CurrentUser currentUser) {
        this.readingProgressService = readingProgressService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Save my reading position in a story: the chapter must be public and belong to the story; "
            + "scrollPercent 0-100, rounded to 2 decimals (CSRF; rate limit 'progress' per user)")
    @RateLimited(value = "progress", scope = RateLimited.Scope.USER)
    @PutMapping("/{storyId}")
    public ReadingProgressResponse save(@PathVariable int storyId, @Valid @RequestBody ReadingProgressRequest body) {
        return readingProgressService.save(currentUser.requireId(), storyId, body);
    }

    @Operation(summary = "My reading position in a story (\"continue reading\")")
    @ApiResponse(responseCode = "200", description = "Position found")
    @ApiResponse(responseCode = "204",
            description = "No position yet, or the stored chapter is no longer public")
    @GetMapping("/{storyId}")
    public ResponseEntity<ReadingProgressResponse> get(@PathVariable int storyId) {
        return readingProgressService.get(currentUser.requireId(), storyId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
