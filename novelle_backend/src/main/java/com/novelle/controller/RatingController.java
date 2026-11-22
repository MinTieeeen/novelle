package com.novelle.controller;

import com.novelle.dto.RatingRequest;
import com.novelle.dto.RatingResponse;
import com.novelle.dto.RatingSaveResponse;
import com.novelle.dto.StoryRatingsResponse;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.RatingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ratings and reviews (F6). The list is public; {@code GET …/ratings/me} is listed as authenticated in SecurityConfig
 * (before the public {@code /api/stories/**} rule).
 */
@Tag(name = "Ratings")
@RestController
@RequestMapping("/api/stories/{storyId}/ratings")
public class RatingController {

    private final RatingService ratingService;
    private final CurrentUser currentUser;

    public RatingController(RatingService ratingService, CurrentUser currentUser) {
        this.ratingService = ratingService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Ratings of a public story: average, 1-5 distribution and a page of ratings, newest first; "
            + "hasReview=true keeps only those with a review text")
    @GetMapping
    public StoryRatingsResponse list(@PathVariable int storyId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size,
            @RequestParam(defaultValue = "false") boolean hasReview) {
        return ratingService.list(storyId, page, size, hasReview);
    }

    @Operation(summary = "My rating of a story")
    @ApiResponse(responseCode = "200", description = "Rating found")
    @ApiResponse(responseCode = "204", description = "I have not rated this story")
    @GetMapping("/me")
    public ResponseEntity<RatingResponse> mine(@PathVariable int storyId) {
        return ratingService.mine(currentUser.requireId(), storyId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @Operation(summary = "Create or update my rating: score 1-5, review up to 1000 characters; not for admins nor for "
            + "the story's author (CSRF; rate limit 'rating' per user)")
    @RateLimited(value = "rating", scope = RateLimited.Scope.USER)
    @PutMapping("/me")
    public RatingSaveResponse save(@PathVariable int storyId, @Valid @RequestBody RatingRequest body) {
        return ratingService.save(currentUser.require(), storyId, body);
    }

    @Operation(summary = "Delete my rating (idempotent; CSRF; rate limit 'rating')")
    @RateLimited(value = "rating", scope = RateLimited.Scope.USER)
    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int storyId) {
        ratingService.delete(currentUser.require(), storyId);
    }
}
