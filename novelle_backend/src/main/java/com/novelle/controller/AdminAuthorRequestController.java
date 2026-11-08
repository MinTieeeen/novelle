package com.novelle.controller;

import com.novelle.dto.AdminAuthorRequestDetailResponse;
import com.novelle.dto.AdminAuthorRequestItemResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.RejectAuthorRequestRequest;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.AuthorRequestReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Reviewing author requests (F11, RB15). ADMIN only (/api/admin/** in SecurityConfig). */
@Tag(name = "Admin — author requests")
@RestController
@RequestMapping("/api/admin/author-requests")
public class AdminAuthorRequestController {

    private final AuthorRequestReviewService reviewService;
    private final CurrentUser currentUser;

    public AdminAuthorRequestController(AuthorRequestReviewService reviewService, CurrentUser currentUser) {
        this.reviewService = reviewService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Review queue: status PENDING (default, oldest first), APPROVED, REJECTED, CANCELLED or ALL")
    @GetMapping
    public PageResponse<AdminAuthorRequestItemResponse> page(@RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return reviewService.page(status, page, size);
    }

    @Operation(summary = "One request with the applicant's account and their other requests")
    @GetMapping("/{requestId}")
    public AdminAuthorRequestDetailResponse detail(@PathVariable int requestId) {
        return reviewService.detail(requestId);
    }

    @Operation(summary = "Approve: sp_ApproveAuthorRequest makes the applicant an AUTHOR in one transaction (CSRF)")
    @PostMapping("/{requestId}/approve")
    public AdminAuthorRequestDetailResponse approve(@PathVariable int requestId) {
        return reviewService.approve(currentUser.requireId(), requestId);
    }

    @Operation(summary = "Reject with an optional note of up to 500 characters (CSRF)")
    @PostMapping("/{requestId}/reject")
    public AdminAuthorRequestDetailResponse reject(@PathVariable int requestId,
            @Valid @RequestBody(required = false) RejectAuthorRequestRequest body) {
        return reviewService.reject(currentUser.requireId(), requestId, body == null ? null : body.note());
    }
}
