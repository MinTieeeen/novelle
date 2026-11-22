package com.novelle.model;

/** Follower totals of the dashboard (D4): all followers and those who started following in the window. */
public class FollowerSummary {

    private int followerCount;
    private int newFollowers;

    public int getFollowerCount() { return followerCount; }
    public void setFollowerCount(int followerCount) { this.followerCount = followerCount; }

    public int getNewFollowers() { return newFollowers; }
    public void setNewFollowers(int newFollowers) { this.newFollowers = newFollowers; }
}
