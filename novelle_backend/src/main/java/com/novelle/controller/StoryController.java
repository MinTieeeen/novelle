package com.novelle.controller;

import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.dto.StoryDetailResponse;
import com.novelle.dto.StorySearchRequest;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.service.StorySearchService;
import com.novelle.service.StoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public story search and story detail. */
@Tag(name = "Stories")
@RestController
@RequestMapping("/api/stories")
public class StoryController {

    private final StorySearchService storySearchService;
    private final StoryService storyService;

    public StoryController(StorySearchService storySearchService, StoryService storyService) {
        this.storySearchService = storySearchService;
        this.storyService = storyService;
    }

    @Operation(summary = "Search public stories: accent-insensitive full-text q, filters, sort, paging "
            + "(rate limit 'search' per IP)")
    @RateLimited("search")
    @GetMapping
    public PageResponse<StoryCardResponse> search(@Valid @ParameterObject @ModelAttribute StorySearchRequest query) {
        return storySearchService.search(query);
    }

    @Operation(summary = "Public story detail with genres, tags and table of contents (cached 10m)")
    @GetMapping("/{slug}")
    public StoryDetailResponse detail(@PathVariable String slug) {
        return storyService.getDetail(slug);
    }
}
