package com.novelle.dto;

/** GET /api/auth/csrf: send {@code token} in the {@code headerName} header of every write request. */
public record CsrfResponse(String headerName, String token) {
}
