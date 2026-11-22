package com.novelle.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Views over time (D2). Dates are Vietnam calendar days ({@code yyyy-MM-dd}); by month, {@code date} is the first
 * day of the month. Every period of the range is present, with 0 when it had no view.
 */
public record ViewSeriesResponse(
        String granularity,
        LocalDate from,
        LocalDate to,
        Integer storyId,
        long total,
        List<Point> points) {

    public record Point(LocalDate date, long views) {
    }
}
