package com.novelle.dto;

/** Whether I follow a story, with its follower count after the request (F1–F3). */
public record FollowStatusResponse(int storyId, boolean following, int followCount) {
}
