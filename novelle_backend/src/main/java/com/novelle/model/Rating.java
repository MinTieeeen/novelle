package com.novelle.model;

import java.time.LocalDateTime;

/** One row of {@code dbo.Rating} with the user who wrote it. */
public class Rating {

    private int storyId;
    private int score;
    private String review;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private UserRef user;

    public int getStoryId() { return storyId; }
    public void setStoryId(int storyId) { this.storyId = storyId; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public String getReview() { return review; }
    public void setReview(String review) { this.review = review; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public UserRef getUser() { return user; }
    public void setUser(UserRef user) { this.user = user; }
}
