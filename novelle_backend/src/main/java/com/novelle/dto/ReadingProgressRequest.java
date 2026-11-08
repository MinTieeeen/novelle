package com.novelle.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/**
 * Body of PUT /api/reading-progress/{storyId}. More than 2 decimals is not an error: the service rounds half up
 * (module-reading section 7.5). The service repeats these checks (source of truth).
 */
public record ReadingProgressRequest(
        @NotNull @Positive Long chapterId,
        @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal scrollPercent) {
}
