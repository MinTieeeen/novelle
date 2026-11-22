package com.novelle.infrastructure.security;

import java.io.IOException;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiErrorWriter;
import com.novelle.exception.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/** 401 as an ApiError JSON body when an anonymous request hits a protected URL. */
@Component
public class JsonAuthEntryPoint implements AuthenticationEntryPoint {

    private final ApiErrorWriter writer;

    public JsonAuthEntryPoint(ApiErrorWriter writer) {
        this.writer = writer;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        writer.write(response, ApiError.of(ErrorCode.UNAUTHENTICATED));
    }
}
