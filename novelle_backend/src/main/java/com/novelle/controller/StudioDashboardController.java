package com.novelle.controller;

import java.time.LocalDate;
import java.util.List;

import com.novelle.dto.DashboardOverviewResponse;
import com.novelle.dto.FollowersResponse;
import com.novelle.dto.StoryStatsResponse;
import com.novelle.dto.ViewSeriesResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Author dashboard (F10, D1–D4). AUTHOR only (SecurityConfig). */
@Tag(name = "Studio — dashboard")
@RestController
@RequestMapping("/api/studio/dashboard")
public class StudioDashboardController {

    private final DashboardService dashboardService;
    private final CurrentUser currentUser;

    public StudioDashboardController(DashboardService dashboardService, CurrentUser currentUser) {
        this.dashboardService = dashboardService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Totals over my stories (vw_AuthorStats)")
    @GetMapping
    public DashboardOverviewResponse overview() {
        return dashboardService.overview(currentUser.requireId());
    }

    @Operation(summary = "Views per day or month (Vietnam dates, yyyy-MM-dd); default the last 30 days / 12 months; "
            + "optional storyId of one of my stories")
    @GetMapping("/views")
    public ViewSeriesResponse views(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String granularity,
            @RequestParam(required = false) Integer storyId) {
        return dashboardService.views(currentUser.requireId(), from, to, granularity, storyId);
    }

    @Operation(summary = "Statistics of each of my stories, views of the last 30 days, above my average rating")
    @GetMapping("/stories")
    public List<StoryStatsResponse> stories() {
        return dashboardService.stories(currentUser.requireId());
    }

    @Operation(summary = "My followers: totals, new in 30 days, the 20 newest, the 10 most followed stories")
    @GetMapping("/followers")
    public FollowersResponse followers() {
        return dashboardService.followers(currentUser.requireId());
    }
}
