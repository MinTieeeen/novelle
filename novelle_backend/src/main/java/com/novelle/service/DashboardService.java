package com.novelle.service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.novelle.dto.DashboardOverviewResponse;
import com.novelle.dto.FollowersResponse;
import com.novelle.dto.StoryStatsResponse;
import com.novelle.dto.ViewSeriesResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.DashboardMapper;
import com.novelle.model.AuthorDashboardStats;
import com.novelle.model.ViewPoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Author dashboard (F10, D1–D4). Dates are calendar days in {@code app.views.zone} (Vietnam), the zone in which
 * StoryViewDaily is filled by sp_FlushViews.
 */
@Service
public class DashboardService {

    static final int DEFAULT_DAYS = 30;
    static final int DEFAULT_MONTHS = 12;
    static final int MAX_DAYS = 366;
    static final int MAX_MONTHS = 60;
    static final int RECENT_FOLLOWERS = 20;
    static final int TOP_STORIES = 10;
    static final Duration RECENT_WINDOW = Duration.ofDays(30);

    private final DashboardMapper dashboardMapper;
    private final StudioOwnership ownership;
    private final ViewProperties views;
    private final Clock clock;

    @Autowired
    public DashboardService(DashboardMapper dashboardMapper, StudioOwnership ownership, ViewProperties views) {
        this(dashboardMapper, ownership, views, Clock.systemUTC());
    }

    DashboardService(DashboardMapper dashboardMapper, StudioOwnership ownership, ViewProperties views,
                     Clock clock) {
        this.dashboardMapper = dashboardMapper;
        this.ownership = ownership;
        this.views = views;
        this.clock = clock;
    }

    /** D1. */
    @Transactional(readOnly = true)
    public DashboardOverviewResponse overview(int authorId) {
        AuthorDashboardStats stats = dashboardMapper.overview(authorId);
        if (stats == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        return DashboardOverviewResponse.from(stats);
    }

    /**
     * D2. Defaults: the last 30 days (by day) or the last 12 months (by month), ending today. By month the range is
     * widened to whole months. Every period is returned, 0 when it had no view.
     */
    @Transactional(readOnly = true)
    public ViewSeriesResponse views(int authorId, LocalDate from, LocalDate to, String granularity, Integer storyId) {
        boolean monthly = parseGranularity(granularity);
        LocalDate end = to != null ? to : today();
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
        if (storyId != null) {
            ownership.story(storyId, authorId);
        }

        Map<LocalDate, Long> found = new HashMap<>();
        for (ViewPoint p : dashboardMapper.viewSeries(authorId, storyId, start, end, monthly)) {
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

    /** D3: every story that is not deleted, with the views of the last 30 days (today included). */
    @Transactional(readOnly = true)
    public List<StoryStatsResponse> stories(int authorId) {
        LocalDate since = today().minusDays(DEFAULT_DAYS - 1L);
        return dashboardMapper.storyStats(authorId, since).stream().map(StoryStatsResponse::from).toList();
    }

    /** D4: totals, followers who started in the last 30 days, the newest followers and the most followed stories. */
    @Transactional(readOnly = true)
    public FollowersResponse followers(int authorId) {
        LocalDateTime since = LocalDateTime.ofInstant(clock.instant().minus(RECENT_WINDOW), ZoneOffset.UTC);
        var summary = dashboardMapper.followerSummary(authorId, since);
        if (summary == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
        return FollowersResponse.from(summary, dashboardMapper.recentFollowers(authorId, RECENT_FOLLOWERS),
                dashboardMapper.topFollowedStories(authorId, TOP_STORIES));
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), views.zone());
    }

    /** null / blank = day. */
    private static boolean parseGranularity(String granularity) {
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
