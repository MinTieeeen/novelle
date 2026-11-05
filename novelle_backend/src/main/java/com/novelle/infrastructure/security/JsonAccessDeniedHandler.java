package com.novelle.infrastructure.security;

import java.io.IOException;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiErrorWriter;
import com.novelle.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

/**
 * 403 as an ApiError JSON body: wrong role for the URL, or a write request without a valid
 * X-XSRF-TOKEN header (reported separately as CSRF_INVALID so the SPA knows to fetch a new token).
 */
@Component
public class JsonAccessDeniedHandler implements AccessDeniedHandler {

    private final ApiErrorWriter writer;

    public JsonAccessDeniedHandler(ApiErrorWriter writer) {
        this.writer = writer;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        ErrorCode code = accessDeniedException instanceof CsrfException ? ErrorCode.CSRF_INVALID : ErrorCode.FORBIDDEN;
        writer.write(response, ApiError.of(code));
    }
}
