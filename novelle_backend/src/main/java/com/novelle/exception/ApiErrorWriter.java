package com.novelle.exception;

import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * Writes an {@link ApiError} straight to the servlet response. Used by code that runs before Spring MVC
 * (security entry point, access-denied handler, servlet filters), where {@link GlobalExceptionHandler}
 * cannot help.
 */
@Component
public class ApiErrorWriter {

    private final ObjectMapper objectMapper;

    public ApiErrorWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletResponse response, ApiError error) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(error.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), error);
    }
}
