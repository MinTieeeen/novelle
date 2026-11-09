package com.novelle.controller;

import com.novelle.dto.AuthorFollowStatusResponse;
import com.novelle.dto.FollowStatusResponse;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.FollowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Follow / unfollow stories and authors (F5). The GETs sit under public paths, so SecurityConfig lists them as
 * authenticated before its permitAll rule; PUT / DELETE need login anyway.
 */
@Tag(name = "Follows")
@RestController
public class FollowController {

    private final FollowService followService;
    private final CurrentUser currentUser;

    public FollowController(FollowService followService, CurrentUser currentUser) {
        this.followService = followService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Whether I follow a public story")
    @GetMapping("/api/stories/{storyId}/follow")
    public FollowStatusResponse storyStatus(@PathVariable int storyId) {
        return followService.storyStatus(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Follow a public story (idempotent; CSRF; rate limit 'follow' per user)")
    @RateLimited(value = "follow", scope = RateLimited.Scope.USER)
    @PutMapping("/api/stories/{storyId}/follow")
    public FollowStatusResponse followStory(@PathVariable int storyId) {
        return followService.followStory(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Unfollow a story, also a hidden one (idempotent; CSRF; rate limit 'follow')")
    @RateLimited(value = "follow", scope = RateLimited.Scope.USER)
    @DeleteMapping("/api/stories/{storyId}/follow")
    public FollowStatusResponse unfollowStory(@PathVariable int storyId) {
        return followService.unfollowStory(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Whether I follow an author")
    @GetMapping("/api/authors/{authorId}/follow")
    public AuthorFollowStatusResponse authorStatus(@PathVariable int authorId) {
        return followService.authorStatus(currentUser.requireId(), authorId);
    }

    @Operation(summary = "Follow an author, not myself (idempotent; CSRF; rate limit 'follow')")
    @RateLimited(value = "follow", scope = RateLimited.Scope.USER)
    @PutMapping("/api/authors/{authorId}/follow")
    public AuthorFollowStatusResponse followAuthor(@PathVariable int authorId) {
        return followService.followAuthor(currentUser.requireId(), authorId);
    }

    @Operation(summary = "Unfollow an author (idempotent; CSRF; rate limit 'follow')")
    @RateLimited(value = "follow", scope = RateLimited.Scope.USER)
    @DeleteMapping("/api/authors/{authorId}/follow")
    public AuthorFollowStatusResponse unfollowAuthor(@PathVariable int authorId) {
        return followService.unfollowAuthor(currentUser.requireId(), authorId);
    }
}
