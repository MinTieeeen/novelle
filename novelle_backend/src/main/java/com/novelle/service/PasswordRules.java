package com.novelle.service;

import java.nio.charset.StandardCharsets;
import java.util.List;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;

/** BCrypt only reads the first 72 bytes; longer UTF-8 passwords (e.g. with Vietnamese letters) are refused. */
final class PasswordRules {

    static final int MAX_BYTES = 72;

    private PasswordRules() {
    }

    static void checkLength(String field, String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, ErrorCode.VALIDATION_FAILED.defaultMessage(),
                    List.of(new ApiError.FieldError(field, "must be at most " + MAX_BYTES + " bytes in UTF-8")));
        }
    }
}
