package com.novelle.dto;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/** DATETIME2 columns hold UTC without an offset; the API returns them as ISO-8601 instants ("...Z"). */
final class Times {

    private Times() {
    }

    static Instant utc(LocalDateTime value) {
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }
}
