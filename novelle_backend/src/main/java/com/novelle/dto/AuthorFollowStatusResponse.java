package com.novelle.dto;

/** Whether I follow an author, with their follower count after the request (F4–F6). */
public record AuthorFollowStatusResponse(int authorId, boolean following, int followerCount) {
}
