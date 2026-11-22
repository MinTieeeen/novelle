package com.novelle.exception;

/**
 * Body of every error response: {@code { status, code, message, details }}.
 * {@code details} is optional: a list of {@link FieldError} for validation errors, or a small object
 * with extra data (for example the ban reason).
 */
public record ApiError(int status, String code, String message, Object details) {

    public static ApiError of(ErrorCode code, String message, Object details) {
        return new ApiError(code.status().value(), code.name(), message, details);
    }

    public static ApiError of(ErrorCode code) {
        return of(code, code.defaultMessage(), null);
    }

    /** One invalid field of a request (body field, query parameter or path variable). */
    public record FieldError(String field, String message) {
    }
}
