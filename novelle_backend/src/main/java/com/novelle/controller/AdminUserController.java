package com.novelle.controller;

import java.time.LocalDate;

import com.novelle.dto.AdminUserDetailResponse;
import com.novelle.dto.AdminUserItemResponse;
import com.novelle.dto.AuthorVerifyResponse;
import com.novelle.dto.BanUserRequest;
import com.novelle.dto.CreateAdminRequest;
import com.novelle.dto.PageResponse;
import com.novelle.dto.VerifyAuthorRequest;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** User management (F11, docs/module-admin.md U1–U6). {@code /api/admin/**} is ADMIN only (SecurityConfig). */
@Tag(name = "Admin — users")
@RestController
@RequestMapping("/api/admin")
public class AdminUserController {

    private final AdminUserService userService;
    private final CurrentUser currentUser;

    public AdminUserController(AdminUserService userService, CurrentUser currentUser) {
        this.userService = userService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Users filtered by role, status, text (username / email / display name) and creation "
            + "days (Vietnam dates, inclusive), newest first")
    @GetMapping("/users")
    public PageResponse<AdminUserItemResponse> page(
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return userService.page(role, status, q, from, to, page, size);
    }

    @Operation(summary = "One user: account, ban, author profile, author requests per status")
    @GetMapping("/users/{userId}")
    public AdminUserDetailResponse get(@PathVariable int userId) {
        return userService.get(userId);
    }

    @Operation(summary = "Ban a READER or AUTHOR (administrators cannot be banned); their session ends at the "
            + "next request (CSRF)")
    @PostMapping("/users/{userId}/ban")
    public AdminUserDetailResponse ban(@PathVariable int userId, @Valid @RequestBody BanUserRequest body) {
        return userService.ban(currentUser.requireId(), userId, body.reason());
    }

    @Operation(summary = "Lift a ban (CSRF)")
    @PostMapping("/users/{userId}/unban")
    public AdminUserDetailResponse unban(@PathVariable int userId) {
        return userService.unban(userId);
    }

    @Operation(summary = "Create an administrator account (same rules as registration; CSRF)")
    @PostMapping("/admins")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserDetailResponse createAdmin(@Valid @RequestBody CreateAdminRequest body) {
        return userService.createAdmin(body);
    }

    @Operation(summary = "Give or remove the verified badge of an author (CSRF)")
    @PatchMapping("/authors/{authorId}/verify")
    public AuthorVerifyResponse verify(@PathVariable int authorId, @Valid @RequestBody VerifyAuthorRequest body) {
        return userService.setVerified(authorId, body.isVerified());
    }
}
