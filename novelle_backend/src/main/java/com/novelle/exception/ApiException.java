package com.novelle.exception;

import java.util.List;

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

    /**
     * 400 VALIDATION_FAILED for one request field, in the same shape Bean Validation errors have
     * ({@code details = [{field, message}]}); for rules that span several parameters.
     */
    public static ApiException invalidField(String field, String message) {
        return new ApiException(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage(),
                List.of(new ApiError.FieldError(field, message)));
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
