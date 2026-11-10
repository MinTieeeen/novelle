package com.novelle.service;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import com.novelle.dto.DashboardOverviewResponse;
import com.novelle.dto.FollowersResponse;
import com.novelle.dto.StoryStatsResponse;
import com.novelle.dto.ViewSeriesResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.DashboardMapper;
import com.novelle.model.AuthorDashboardStats;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Author dashboard (F10, D1–D4). Dates are calendar days in {@code app.views.zone} (Vietnam), the zone in which
 * StoryViewDaily is filled by sp_FlushViews.
 */
@Service
public class DashboardService {

    static final int DEFAULT_DAYS = ViewSeriesBuilder.DEFAULT_DAYS;
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
        // the ownership check runs after the range checks, right before the query
        return ViewSeriesBuilder.build(from, to, granularity, today(), storyId, (start, end, monthly) -> {
            if (storyId != null) {
                ownership.story(storyId, authorId);
            }
            return dashboardMapper.viewSeries(authorId, storyId, start, end, monthly);
        });
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
}
