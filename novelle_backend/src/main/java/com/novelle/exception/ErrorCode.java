package com.novelle.exception;

import org.springframework.http.HttpStatus;

/**
 * Machine-readable error codes returned in {@link ApiError#code()}. Each code fixes its HTTP status, so a
 * service only picks the code. Feature-specific codes are added here next to the generic ones.
 */
public enum ErrorCode {

    // generic request errors
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed."),
    MALFORMED_REQUEST(HttpStatus.BAD_REQUEST, "Request is missing or malformed."),
    UNAUTHENTICATED(HttpStatus.UNAUTHORIZED, "Login is required."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "You are not allowed to do this."),
    CSRF_INVALID(HttpStatus.FORBIDDEN, "CSRF token is missing or invalid."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Resource not found."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "HTTP method not allowed."),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "Response format not acceptable."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Content type not supported."),
    PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "Request is too large."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Too many requests, try again later."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error."),

    // data conflicts (constraints, optimistic locking, stored procedure errors 50001/50003/50007)
    CONFLICT(HttpStatus.CONFLICT, "The request conflicts with the current data."),
    STALE_DATA(HttpStatus.CONFLICT, "The data was changed by someone else; reload and try again."),
    ALREADY_PROCESSED(HttpStatus.CONFLICT, "This item was already processed."),
    PEN_NAME_TAKEN(HttpStatus.CONFLICT, "Pen name is already in use."),

    // accounts
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Wrong username, email or password."),
    ACCOUNT_BANNED(HttpStatus.FORBIDDEN, "This account is banned."),
    USERNAME_TAKEN(HttpStatus.CONFLICT, "Username is already in use."),
    EMAIL_TAKEN(HttpStatus.CONFLICT, "Email is already in use."),
    WRONG_PASSWORD(HttpStatus.BAD_REQUEST, "Current password is wrong."),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "User not found.");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }

    /** Generic code for a status produced by Spring MVC itself (unknown route, wrong method, …). */
    public static ErrorCode forStatus(int status) {
        return switch (status) {
            case 400 -> MALFORMED_REQUEST;
            case 401 -> UNAUTHENTICATED;
            case 403 -> FORBIDDEN;
            case 404 -> NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 409 -> CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 429 -> RATE_LIMITED;
            default -> INTERNAL_ERROR;
        };
    }
}
