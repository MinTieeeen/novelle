package com.novelle.controller;

import java.util.List;

import com.novelle.dto.AuthorRequestResponse;
import com.novelle.dto.CreateAuthorRequestRequest;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.AuthorRequestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Becoming an author (F7). Login required (anyRequest().authenticated()); the READER check is in the service. */
@Tag(name = "Author requests")
@RestController
@RequestMapping("/api/author-requests")
public class AuthorRequestController {

    private final AuthorRequestService authorRequestService;
    private final CurrentUser currentUser;

    public AuthorRequestController(AuthorRequestService authorRequestService, CurrentUser currentUser) {
        this.authorRequestService = authorRequestService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "My author requests, newest first")
    @GetMapping("/me")
    public List<AuthorRequestResponse> mine() {
        return authorRequestService.mine(currentUser.requireId());
    }

    @Operation(summary = "Ask to become an author: ACTIVE READER only, one PENDING request at a time, unused pen name "
            + "(CSRF; rate limit 'author-request' per user)")
    @RateLimited(value = "author-request", scope = RateLimited.Scope.USER)
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AuthorRequestResponse submit(@Valid @RequestBody CreateAuthorRequestRequest body) {
        return authorRequestService.submit(currentUser.requireId(), body);
    }

    @Operation(summary = "Cancel my pending request (CSRF)")
    @PostMapping("/{requestId}/cancel")
    public AuthorRequestResponse cancel(@PathVariable int requestId) {
        return authorRequestService.cancel(currentUser.requireId(), requestId);
    }
}
