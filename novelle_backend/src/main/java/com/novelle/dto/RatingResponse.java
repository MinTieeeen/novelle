package com.novelle.dto;

import java.time.Instant;

import com.novelle.model.Rating;

/** One rating with its author (D1, D2). */
public record RatingResponse(
        int storyId,
        UserRefResponse user,
        int score,
        String review,
        Instant createdAt,
        Instant updatedAt) {

    public static RatingResponse from(Rating r) {
        return new RatingResponse(r.getStoryId(), UserRefResponse.from(r.getUser()), r.getScore(), r.getReview(),
                Times.utc(r.getCreatedAt()), Times.utc(r.getUpdatedAt()));
    }
}
