package com.novelle.model;

import java.time.LocalDateTime;

/** A volume of one of my stories, with the number of its chapters that are not deleted. */
public class StudioVolume {

    private int volumeId;
    private int storyId;
    private int volumeNo;
    private String title;
    private int chapterCount;
    private LocalDateTime createdAt;

    public int getVolumeId() { return volumeId; }
    public void setVolumeId(int volumeId) { this.volumeId = volumeId; }

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public int getVolumeNo() { return volumeNo; }
    public void setVolumeNo(int volumeNo) { this.volumeNo = volumeNo; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public int getChapterCount() { return chapterCount; }
    public void setChapterCount(int chapterCount) { this.chapterCount = chapterCount; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
