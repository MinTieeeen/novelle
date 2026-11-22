package com.novelle.dto;

import java.math.BigDecimal;

/** My saved rating with the story's new average and count, as recomputed by trg_Rating (D3). */
public record RatingSaveResponse(RatingResponse rating, BigDecimal ratingAvg, int ratingCount) {
}
