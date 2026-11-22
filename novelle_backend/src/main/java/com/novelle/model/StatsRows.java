package com.novelle.model;

import java.time.LocalDate;

/** Rows of the admin statistics queries (StatsMapper, docs/module-admin.md S1–S5). */
public final class StatsRows {

    private StatsRows() {
    }

    /** Users of one role and status (S1). */
    public static class RoleStatusCount {
        private String role;
        private String status;
        private long total;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public long getTotal() { return total; }
        public void setTotal(long total) { this.total = total; }
    }

    /** Stories of one publish status (S1). */
    public static class StoryStatusCount {
        private String publishStatus;
        private long total;

        public String getPublishStatus() { return publishStatus; }
        public void setPublishStatus(String publishStatus) { this.publishStatus = publishStatus; }

        public long getTotal() { return total; }
        public void setTotal(long total) { this.total = total; }
    }

    /** Content totals over the stories that are not deleted (S1). */
    public static class ContentTotals {
        private long publishedChapters;
        private long totalChapters;
        private long totalWords;
        private long totalViews;
        private long totalRatings;

        public long getPublishedChapters() { return publishedChapters; }
        public void setPublishedChapters(long publishedChapters) { this.publishedChapters = publishedChapters; }

        public long getTotalChapters() { return totalChapters; }
        public void setTotalChapters(long totalChapters) { this.totalChapters = totalChapters; }

        public long getTotalWords() { return totalWords; }
        public void setTotalWords(long totalWords) { this.totalWords = totalWords; }

        public long getTotalViews() { return totalViews; }
        public void setTotalViews(long totalViews) { this.totalViews = totalViews; }

        public long getTotalRatings() { return totalRatings; }
        public void setTotalRatings(long totalRatings) { this.totalRatings = totalRatings; }
    }

    /** One genre with its public stories and their views (S3). */
    public static class GenreStat {
        private int genreId;
        private String name;
        private String slug;
        private long storyCount;
        private long totalViews;

        public int getGenreId() { return genreId; }
        public void setGenreId(int genreId) { this.genreId = genreId; }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getSlug() { return slug; }
        public void setSlug(String slug) { this.slug = slug; }

        public long getStoryCount() { return storyCount; }
        public void setStoryCount(long storyCount) { this.storyCount = storyCount; }

        public long getTotalViews() { return totalViews; }
        public void setTotalViews(long totalViews) { this.totalViews = totalViews; }
    }

    /** New users of one role in one month (first day, Vietnam calendar) (S4). */
    public static class MonthRoleCount {
        private LocalDate month;
        private String role;
        private long total;

        public LocalDate getMonth() { return month; }
        public void setMonth(LocalDate month) { this.month = month; }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public long getTotal() { return total; }
        public void setTotal(long total) { this.total = total; }
    }

    /** An author whose total views are above the system average (S5). */
    public static class TopAuthor {
        private int authorId;
        private String penName;
        private boolean isVerified;
        private int followerCount;
        private int storyCount;
        private long totalViews;

        public int getAuthorId() { return authorId; }
        public void setAuthorId(int authorId) { this.authorId = authorId; }

        public String getPenName() { return penName; }
        public void setPenName(String penName) { this.penName = penName; }

        public boolean isVerified() { return isVerified; }
        public void setIsVerified(boolean isVerified) { this.isVerified = isVerified; }

        public int getFollowerCount() { return followerCount; }
        public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

        public int getStoryCount() { return storyCount; }
        public void setStoryCount(int storyCount) { this.storyCount = storyCount; }

        public long getTotalViews() { return totalViews; }
        public void setTotalViews(long totalViews) { this.totalViews = totalViews; }
    }
}
