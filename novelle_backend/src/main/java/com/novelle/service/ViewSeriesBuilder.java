package com.novelle.service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.novelle.dto.ViewSeriesResponse;
import com.novelle.exception.ApiException;
import com.novelle.model.ViewPoint;

/**
 * Views per day or per month, shared by the author dashboard (module-studio D2) and the admin statistics
 * (module-admin S2): default range, limits, whole months, and 0 for every period without views. Dates are calendar
 * days in {@code app.views.zone}, as stored in StoryViewDaily.
 */
final class ViewSeriesBuilder {

    static final int DEFAULT_DAYS = 30;
    static final int DEFAULT_MONTHS = 12;
    static final int MAX_DAYS = 366;
    static final int MAX_MONTHS = 60;

    /** Reads the stored views of {@code [start, end]}; called only after the range is valid. */
    @FunctionalInterface
    interface Loader {
        List<ViewPoint> load(LocalDate start, LocalDate end, boolean monthly);
    }

    private ViewSeriesBuilder() {
    }

    static ViewSeriesResponse build(LocalDate from, LocalDate to, String granularity, LocalDate today,
                                    Integer storyId, Loader loader) {
        boolean monthly = parseGranularity(granularity);
        LocalDate end = to != null ? to : today;
        LocalDate start = from != null ? from
                : monthly ? end.withDayOfMonth(1).minusMonths(DEFAULT_MONTHS - 1L) : end.minusDays(DEFAULT_DAYS - 1L);
        if (monthly) {
            start = start.withDayOfMonth(1);
            end = end.withDayOfMonth(end.lengthOfMonth());
        }
        if (start.isAfter(end)) {
            throw ApiException.invalidField("from", "must not be after to");
        }
        if (monthly ? ChronoUnit.MONTHS.between(start, end) + 1 > MAX_MONTHS
                    : ChronoUnit.DAYS.between(start, end) + 1 > MAX_DAYS) {
            throw ApiException.invalidField("from",
                    monthly ? "at most " + MAX_MONTHS + " months" : "at most " + MAX_DAYS + " days");
        }

        Map<LocalDate, Long> found = new HashMap<>();
        for (ViewPoint p : loader.load(start, end, monthly)) {
            found.put(p.getPeriod(), p.getViews());
        }
        List<ViewSeriesResponse.Point> points = new ArrayList<>();
        long total = 0;
        for (LocalDate d = start; !d.isAfter(end); d = monthly ? d.plusMonths(1) : d.plusDays(1)) {
            long v = found.getOrDefault(d, 0L);
            total += v;
            points.add(new ViewSeriesResponse.Point(d, v));
        }
        return new ViewSeriesResponse(monthly ? "month" : "day", start, end, storyId, total, points);
    }

    /** null / blank = day. */
    static boolean parseGranularity(String granularity) {
        if (granularity == null || granularity.isBlank()) {
            return false;
        }
        return switch (granularity.strip().toLowerCase(Locale.ROOT)) {
            case "day" -> false;
            case "month" -> true;
            default -> throw ApiException.invalidField("granularity", "must be day or month");
        };
    }
}
