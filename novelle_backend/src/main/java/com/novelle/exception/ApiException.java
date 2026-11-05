package com.novelle.exception;

/**
 * Business error thrown by services (and interceptors); {@link GlobalExceptionHandler} turns it into an
 * {@link ApiError} with the status of its {@link ErrorCode}.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode code;
    private final transient Object details;

    public ApiException(ErrorCode code) {
        this(code, code.defaultMessage(), null);
    }

    public ApiException(ErrorCode code, String message) {
        this(code, message, null);
    }

    public ApiException(ErrorCode code, String message, Object details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public ErrorCode code() {
        return code;
    }

    public Object details() {
        return details;
    }

    public ApiError toApiError() {
        return ApiError.of(code, getMessage(), details);
    }
}
