package com.novelle.controller;

import com.novelle.dto.CsrfResponse;
import com.novelle.dto.LoginRequest;
import com.novelle.dto.MeResponse;
import com.novelle.dto.RegisterRequest;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.SessionAuthenticator;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.service.AuthService;
import com.novelle.service.ProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Register, login and the CSRF token. Logout (POST /api/auth/logout) is handled by Spring Security. */
@Tag(name = "Auth")
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final ProfileService profileService;
    private final SessionAuthenticator sessionAuthenticator;

    public AuthController(AuthService authService, ProfileService profileService,
            SessionAuthenticator sessionAuthenticator) {
        this.authService = authService;
        this.profileService = profileService;
        this.sessionAuthenticator = sessionAuthenticator;
    }

    @Operation(summary = "Get a CSRF token (also sets the XSRF-TOKEN cookie); call before the first write request")
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @Operation(summary = "Create a READER account and log in")
    @RateLimited("register")
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public MeResponse register(@Valid @RequestBody RegisterRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        SessionUser user = authService.register(body);
        sessionAuthenticator.signIn(user, request, response);
        return profileService.getMe(user.userId());
    }

    @Operation(summary = "Log in with username or email")
    @RateLimited("login")
    @PostMapping("/login")
    public MeResponse login(@Valid @RequestBody LoginRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        SessionUser user = authService.login(body);
        sessionAuthenticator.signIn(user, request, response);
        return profileService.getMe(user.userId());
    }
}
