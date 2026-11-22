package com.novelle.controller;

import com.novelle.dto.FollowedAuthorResponse;
import com.novelle.dto.HistoryItemResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.FollowService;
import com.novelle.service.LibraryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** My library (F5): reading history, followed stories and authors. Login required (anyRequest().authenticated()). */
@Tag(name = "Library")
@RestController
@RequestMapping("/api/library")
public class LibraryController {

    private final LibraryService libraryService;
    private final FollowService followService;
    private final CurrentUser currentUser;

    public LibraryController(LibraryService libraryService, FollowService followService, CurrentUser currentUser) {
        this.libraryService = libraryService;
        this.followService = followService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "My reading history over public stories, most recently read first")
    @GetMapping("/history")
    public PageResponse<HistoryItemResponse> history(@RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return libraryService.history(currentUser.requireId(), page, size);
    }

    @Operation(summary = "Remove a story from my reading history (idempotent; CSRF)")
    @DeleteMapping("/history/{storyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteHistory(@PathVariable int storyId) {
        libraryService.deleteHistory(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Public stories I follow, newest chapter first")
    @GetMapping("/follows")
    public PageResponse<StoryCardResponse> follows(@RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return followService.followedStories(currentUser.requireId(), page, size);
    }

    @Operation(summary = "Authors I follow, most recently followed first")
    @GetMapping("/authors")
    public PageResponse<FollowedAuthorResponse> authors(@RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return followService.followedAuthors(currentUser.requireId(), page, size);
    }
}
