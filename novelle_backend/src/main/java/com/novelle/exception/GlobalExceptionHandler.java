package com.novelle.exception;

import java.sql.SQLException;
import java.util.List;
import java.util.stream.Stream;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.lang.Nullable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns every exception thrown by controllers, services, mappers and MVC interceptors into an
 * {@link ApiError}. Spring MVC's own errors (unknown route, wrong method, unreadable body, …) go through
 * {@link #handleExceptionInternal}, so they use the same JSON shape instead of ProblemDetail.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /*
     * Error numbers raised with THROW by the stored procedures and triggers (05_procedures.sql,
     * 06_triggers.sql). 50005 and 50006 mean the backend broke a database contract, so they stay 500.
     */
    private static final int SQL_ALREADY_PROCESSED = 50001;
    private static final int SQL_NOT_ALLOWED = 50002;
    private static final int SQL_PEN_NAME_TAKEN = 50003;
    private static final int SQL_NOT_FOUND = 50004;
    private static final int SQL_VOLUME_OTHER_STORY = 50007;

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApi(ApiException ex) {
        return respond(ex.toApiError());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException ex) {
        List<ApiError.FieldError> fields = ex.getConstraintViolations().stream()
                .map(v -> new ApiError.FieldError(lastNode(v.getPropertyPath().toString()), v.getMessage()))
                .toList();
        return respond(ApiError.of(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage(), fields));
    }

    /** A UNIQUE constraint or index rejected the write; services catch it first when they can name the field. */
    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<ApiError> handleDuplicateKey(DuplicateKeyException ex) {
        log.debug("Duplicate key: {}", ex.getMostSpecificCause().getMessage());
        return respond(ApiError.of(ErrorCode.CONFLICT));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ApiError> handleDataAccess(DataAccessException ex) {
        SQLException sql = findSqlException(ex);
        ErrorCode code = sql == null ? null : switch (sql.getErrorCode()) {
            case SQL_ALREADY_PROCESSED -> ErrorCode.ALREADY_PROCESSED;
            case SQL_NOT_ALLOWED -> ErrorCode.FORBIDDEN;
            case SQL_PEN_NAME_TAKEN -> ErrorCode.PEN_NAME_TAKEN;
            case SQL_NOT_FOUND -> ErrorCode.NOT_FOUND;
            case SQL_VOLUME_OTHER_STORY -> ErrorCode.CONFLICT;
            default -> null;
        };
        if (code == null) {
            log.error("Database error", ex);
            return respond(ApiError.of(ErrorCode.INTERNAL_ERROR));
        }
        // the procedures' messages are written for API clients (English, no internal details)
        return respond(ApiError.of(code, sql.getMessage(), null));
    }

    /** Thrown by method security or by services that check access by hand. */
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        return respond(ApiError.of(ErrorCode.FORBIDDEN));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ApiError> handleAuthentication(AuthenticationException ex) {
        return respond(ApiError.of(ErrorCode.UNAUTHENTICATED));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return respond(ApiError.of(ErrorCode.INTERNAL_ERROR));
    }

    /* ---------- Spring MVC errors ---------- */

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return validationFailed(ex.getBindingResult(), headers);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<ApiError.FieldError> fields = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new ApiError.FieldError(
                                result.getMethodParameter().getParameterName(), error.getDefaultMessage())))
                .toList();
        ApiError body = ApiError.of(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage(), fields);
        return new ResponseEntity<>(body, headers, body.status());
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        // the parser message may echo internals (class names), so the client only gets the generic text
        log.debug("Unreadable request body: {}", ex.getMessage());
        ApiError body = ApiError.of(ErrorCode.MALFORMED_REQUEST);
        return new ResponseEntity<>(body, headers, body.status());
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body,
            HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        ErrorCode code = ErrorCode.forStatus(statusCode.value());
        if (statusCode.is5xxServerError()) {
            log.error("MVC error {}", statusCode.value(), ex);
        }
        ApiError error = new ApiError(statusCode.value(), code.name(), code.defaultMessage(), null);
        return new ResponseEntity<>(error, headers, statusCode);
    }

    /* ---------- helpers ---------- */

    private ResponseEntity<Object> validationFailed(BindingResult result, HttpHeaders headers) {
        List<ApiError.FieldError> fields = Stream.concat(
                result.getFieldErrors().stream()
                        .map(e -> new ApiError.FieldError(e.getField(), e.getDefaultMessage())),
                result.getGlobalErrors().stream()           // class-level constraints
                        .map(e -> new ApiError.FieldError(e.getObjectName(), e.getDefaultMessage())))
                .toList();
        ApiError body = ApiError.of(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage(), fields);
        return new ResponseEntity<>(body, headers, body.status());
    }

    private static ResponseEntity<ApiError> respond(ApiError error) {
        return ResponseEntity.status(error.status()).body(error);
    }

    private static SQLException findSqlException(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql) {
                return sql;
            }
        }
        return null;
    }

    /** "register.request.email" -> "email" */
    private static String lastNode(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? path : path.substring(dot + 1);
    }
}
