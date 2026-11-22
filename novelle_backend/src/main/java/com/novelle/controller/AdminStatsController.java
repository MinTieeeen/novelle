package com.novelle.controller;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.novelle.dto.GenreStatsResponse;
import com.novelle.dto.StatsOverviewResponse;
import com.novelle.dto.TopAuthorsResponse;
import com.novelle.dto.UserGrowthResponse;
import com.novelle.dto.ViewSeriesResponse;
import com.novelle.service.StatsService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * System statistics (F13, docs/module-admin.md S1–S5). ADMIN only (SecurityConfig). Calls without parameters are
 * cached for CACHE_STATS_TTL (5 minutes).
 */
@Tag(name = "Admin — stats")
@RestController
@RequestMapping("/api/admin/stats")
public class AdminStatsController {

    private final StatsService statsService;

    public AdminStatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @Operation(summary = "Users per role, stories per status, chapter / word / view / rating totals")
    @GetMapping("/overview")
    public StatsOverviewResponse overview() {
        return statsService.overview();
    }

    @Operation(summary = "Views of every story per day or month (Vietnam dates); default the last 30 days / 12 months")
    @GetMapping("/views")
    public ViewSeriesResponse views(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String granularity) {
        return statsService.views(from, to, granularity);
    }

    @Operation(summary = "Public stories and their views per genre")
    @GetMapping("/genres")
    public GenreStatsResponse genres() {
        return statsService.genres();
    }

    @Operation(summary = "New users per month and role (default the last 12 months, at most 60)")
    @GetMapping("/users")
    public UserGrowthResponse users(@RequestParam(required = false) Integer months) {
        return statsService.users(months);
    }

    @Operation(summary = "Authors whose total views are above the average of all authors (subquery + HAVING)")
    @GetMapping("/top-authors")
    public TopAuthorsResponse topAuthors(@RequestParam(required = false) Integer limit) {
        return statsService.topAuthors(limit);
    }
}
