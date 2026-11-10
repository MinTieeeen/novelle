package com.novelle.dto;

import java.math.BigDecimal;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * S5: authors whose total views are above {@code systemAverageViews}, the average of the per-author view totals
 * (authors with at least one story that is not deleted).
 */
public record TopAuthorsResponse(BigDecimal systemAverageViews, List<Item> items) {

    public record Item(int authorId, String penName, @JsonProperty("isVerified") boolean isVerified,
                       int storyCount, long totalViews, int followerCount) {
    }
}
