package com.novelle.model;

/** One of my stories with its follower count (dashboard D4 "most followed"). */
public class StoryFollowRow {

    private int storyId;
    private String title;
    private String slug;
    private int followCount;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public int getFollowCount() { return followCount; }
    public void setFollowCount(int followCount) { this.followCount = followCount; }
}
