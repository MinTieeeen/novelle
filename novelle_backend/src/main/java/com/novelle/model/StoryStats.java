package com.novelle.model;

/**
 * Dashboard row of one of my stories (D3): the studio card plus the views of the last 30 days and whether the
 * story rates above the average of my rated stories (subquery in DashboardMapper.storyStats).
 */
public class StoryStats extends StudioStoryCard {

    private long views30d;
    private boolean aboveMyAverage;

    public long getViews30d() { return views30d; }
    public void setViews30d(long views30d) { this.views30d = views30d; }

    public boolean isAboveMyAverage() { return aboveMyAverage; }
    public void setAboveMyAverage(boolean aboveMyAverage) { this.aboveMyAverage = aboveMyAverage; }
}
