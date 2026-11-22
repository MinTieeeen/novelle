package com.novelle.dto;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.novelle.model.ScoreCount;

/** Ratings of a story (D1): average, count, the 1–5 distribution (every key present) and one page of reviews. */
public record StoryRatingsResponse(
        int storyId,
        BigDecimal ratingAvg,
        int ratingCount,
        Map<String, Integer> distribution,
        PageResponse<RatingResponse> reviews) {

    /** {"1": n, …, "5": n} in score order; scores with no rating are 0. */
    public static Map<String, Integer> distribution(List<ScoreCount> counts) {
        Map<String, Integer> map = new LinkedHashMap<>();
        for (int score = 1; score <= 5; score++) {
            map.put(String.valueOf(score), 0);
        }
        for (ScoreCount c : counts) {
            map.computeIfPresent(String.valueOf(c.getScore()), (k, v) -> c.getTotal());
        }
        return map;
    }
}
