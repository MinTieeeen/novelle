package com.novelle.dto;

import java.math.BigDecimal;

import com.novelle.model.AuthorDashboardStats;

/**
 * Dashboard totals (D1) from vw_AuthorStats over my stories that are not deleted. {@code ratingAvg} is weighted by
 * the number of ratings of each story.
 */
public record DashboardOverviewResponse(
        int storyCount,
        int publishedStoryCount,
        long chapterCount,
        long wordCount,
        long viewCount,
        int followerCount,
        long storyFollowCount,
        BigDecimal ratingAvg,
        long ratingCount) {

    public static DashboardOverviewResponse from(AuthorDashboardStats s) {
        return new DashboardOverviewResponse(s.getStoryCount(), s.getPublishedStoryCount(), s.getChapterCount(),
                s.getWordCount(), s.getViewCount(), s.getFollowerCount(), s.getStoryFollowCount(), s.getRatingAvg(),
                s.getRatingCount());
    }
}
