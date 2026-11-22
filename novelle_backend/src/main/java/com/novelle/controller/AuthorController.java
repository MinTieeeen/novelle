package com.novelle.controller;

import com.novelle.dto.AuthorProfileResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.dto.StoryListRequest;
import com.novelle.service.AuthorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public author pages. */
@Tag(name = "Authors")
@RestController
@RequestMapping("/api/authors")
public class AuthorController {

    private final AuthorService authorService;

    public AuthorController(AuthorService authorService) {
        this.authorService = authorService;
    }

    @Operation(summary = "Author profile with statistics over public stories only")
    @GetMapping("/{authorId}")
    public AuthorProfileResponse profile(@PathVariable int authorId) {
        return authorService.getProfile(authorId);
    }

    @Operation(summary = "Public stories of an author, sorted and paged")
    @GetMapping("/{authorId}/stories")
    public PageResponse<StoryCardResponse> stories(@PathVariable int authorId,
            @ParameterObject @ModelAttribute StoryListRequest query) {
        return authorService.getStories(authorId, query.sort(), query.page(), query.size());
    }
}
