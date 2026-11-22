package com.novelle.dto;

import java.util.Map;

/**
 * S1 (docs/module-admin.md): users per role (every role present, 0 when none), stories per publish status (not
 * deleted), chapter / word / view / rating totals.
 */
public record StatsOverviewResponse(
        Users users,
        Stories stories,
        Chapters chapters,
        long totalWords,
        long totalViews,
        long totalRatings) {

    public record Users(long total, Map<String, Long> byRole, long banned) {
    }

    public record Stories(long total, Map<String, Long> byStatus) {
    }

    public record Chapters(long published, long total) {
    }
}
