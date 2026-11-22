package com.novelle.model;

/** One group of {@code SELECT Score, COUNT(*) ... GROUP BY Score}. */
public class ScoreCount {

    private int score;
    private int total;

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }
}
