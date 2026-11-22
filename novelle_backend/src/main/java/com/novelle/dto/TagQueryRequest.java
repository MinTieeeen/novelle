package com.novelle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * Query parameters of GET /api/tags.
 *
 * @param q     prefix of the tag name or slug (optional)
 * @param limit 1–50, default 20
 */
public record TagQueryRequest(@Size(max = 50) String q, @Min(1) @Max(50) Integer limit) {
}
