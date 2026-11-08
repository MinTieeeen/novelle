package com.novelle.controller;

import java.util.List;

import com.novelle.dto.AddListItemRequest;
import com.novelle.dto.CreateReadingListRequest;
import com.novelle.dto.ReadingListDetailResponse;
import com.novelle.dto.ReadingListItemResponse;
import com.novelle.dto.ReadingListSummaryResponse;
import com.novelle.dto.ReorderItemsRequest;
import com.novelle.dto.UpdateReadingListRequest;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.service.ReadingListService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reading lists (F5). {@code GET /api/reading-lists/{id}} and {@code GET /api/users/{username}/reading-lists} are
 * public (SecurityConfig); every other endpoint needs login, and writes check ownership in the service.
 */
@Tag(name = "Reading lists")
@RestController
public class ReadingListController {

    private final ReadingListService readingListService;
    private final CurrentUser currentUser;

    public ReadingListController(ReadingListService readingListService, CurrentUser currentUser) {
        this.readingListService = readingListService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "My reading lists, most recently updated first")
    @GetMapping("/api/reading-lists")
    public List<ReadingListSummaryResponse> mine() {
        return readingListService.mine(currentUser.requireId());
    }

    @Operation(summary = "Create a reading list (unique name per user; at most READING_LIST_MAX_LISTS; CSRF)")
    @PostMapping("/api/reading-lists")
    @ResponseStatus(HttpStatus.CREATED)
    public ReadingListSummaryResponse create(@Valid @RequestBody CreateReadingListRequest body) {
        return readingListService.create(currentUser.requireId(), body);
    }

    @Operation(summary = "A public list, or one of mine, with a page of its public stories in list order")
    @GetMapping("/api/reading-lists/{listId}")
    public ReadingListDetailResponse detail(@PathVariable int listId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        Integer viewerId = currentUser.find().map(SessionUser::userId).orElse(null);
        return readingListService.detail(viewerId, listId, page, size);
    }

    @Operation(summary = "Edit my list: null = unchanged, empty description = cleared (CSRF)")
    @PatchMapping("/api/reading-lists/{listId}")
    public ReadingListSummaryResponse update(@PathVariable int listId,
            @Valid @RequestBody UpdateReadingListRequest body) {
        return readingListService.update(currentUser.requireId(), listId, body);
    }

    @Operation(summary = "Delete my list and its items (CSRF)")
    @DeleteMapping("/api/reading-lists/{listId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int listId) {
        readingListService.delete(currentUser.requireId(), listId);
    }

    @Operation(summary = "Append a public story to my list (at most READING_LIST_MAX_ITEMS; CSRF)")
    @PostMapping("/api/reading-lists/{listId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public ReadingListItemResponse addItem(@PathVariable int listId, @Valid @RequestBody AddListItemRequest body) {
        return readingListService.addItem(currentUser.requireId(), listId, body);
    }

    @Operation(summary = "Remove a story from my list, also a hidden one (CSRF)")
    @DeleteMapping("/api/reading-lists/{listId}/items/{storyId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeItem(@PathVariable int listId, @PathVariable int storyId) {
        readingListService.removeItem(currentUser.requireId(), listId, storyId);
    }

    @Operation(summary = "Reorder my list: every public story exactly once; hidden stories go last (CSRF)")
    @PutMapping("/api/reading-lists/{listId}/items/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorder(@PathVariable int listId, @Valid @RequestBody ReorderItemsRequest body) {
        readingListService.reorder(currentUser.requireId(), listId, body.storyIds());
    }

    @Operation(summary = "Public reading lists of an active user (public profile)")
    @GetMapping("/api/users/{username}/reading-lists")
    public List<ReadingListSummaryResponse> publicOf(@PathVariable String username) {
        return readingListService.publicOf(username);
    }
}
