package com.novelle.model;

import java.math.BigDecimal;

/** {@code Story.RatingAvg / RatingCount}, kept by trg_Rating. */
public class RatingStats {

    private BigDecimal ratingAvg;
    private int ratingCount;

    public BigDecimal getRatingAvg() { return ratingAvg; }
    public void setRatingAvg(BigDecimal ratingAvg) { this.ratingAvg = ratingAvg; }

    public int getRatingCount() { return ratingCount; }
    public void setRatingCount(int ratingCount) { this.ratingCount = ratingCount; }
}
