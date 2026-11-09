package com.novelle.model;

import java.time.LocalDate;

/** Views of one day, or of one month (period = first day of the month), summed over StoryViewDaily. */
public class ViewPoint {

    private LocalDate period;
    private long views;

    public LocalDate getPeriod() { return period; }
    public void setPeriod(LocalDate period) { this.period = period; }

    public long getViews() { return views; }
    public void setViews(long views) { this.views = views; }
}
