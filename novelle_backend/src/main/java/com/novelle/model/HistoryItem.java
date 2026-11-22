package com.novelle.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * One line of my reading history: the public story card plus my position. {@code lastChapter} is null when the
 * stored chapter is no longer public (docs/module-library.md H1).
 */
public class HistoryItem extends StoryCard {

    private ChapterToc lastChapter;
    private BigDecimal scrollPercent;
    private LocalDateTime readAt;

    public ChapterToc getLastChapter() { return lastChapter; }
    public void setLastChapter(ChapterToc lastChapter) { this.lastChapter = lastChapter; }

    public BigDecimal getScrollPercent() { return scrollPercent; }
    public void setScrollPercent(BigDecimal scrollPercent) { this.scrollPercent = scrollPercent; }

    public LocalDateTime getReadAt() { return readAt; }
    public void setReadAt(LocalDateTime readAt) { this.readAt = readAt; }
}
