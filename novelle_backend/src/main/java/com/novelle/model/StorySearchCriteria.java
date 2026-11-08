package com.novelle.model;

import java.math.BigDecimal;
import java.util.List;

/**
 * Validated parameters of a story list query (StorySearchMapper), built only by StorySearchService.
 * Every value reaches SQL through {@code #{}} except {@link #getOrderBy()}, which always comes from
 * {@code StorySort}. Empty lists mean "no filter".
 */
public class StorySearchCriteria {

    /** Full-text prefix terms ({@code "word*"}), one CONTAINSTABLE each. */
    private List<String> terms = List.of();
    private List<String> genreSlugs = List.of();
    /** false: the story needs every genre (HAVING COUNT = n); true: at least one (EXISTS). */
    private boolean genreAny;
    /** The story needs every tag. */
    private List<String> tagSlugs = List.of();
    private String completionStatus;
    private String ageRating;
    private Integer minChapters;
    private Integer maxChapters;
    private BigDecimal minRating;
    private Integer authorId;
    private String orderBy;
    private int offset;
    private int size;

    public List<String> getTerms() { return terms; }
    public void setTerms(List<String> terms) { this.terms = List.copyOf(terms); }

    public int getTermCount() { return terms.size(); }

    public List<String> getGenreSlugs() { return genreSlugs; }
    public void setGenreSlugs(List<String> genreSlugs) { this.genreSlugs = List.copyOf(genreSlugs); }

    public int getGenreCount() { return genreSlugs.size(); }

    public boolean isGenreAny() { return genreAny; }
    public void setGenreAny(boolean genreAny) { this.genreAny = genreAny; }

    public List<String> getTagSlugs() { return tagSlugs; }
    public void setTagSlugs(List<String> tagSlugs) { this.tagSlugs = List.copyOf(tagSlugs); }

    public int getTagCount() { return tagSlugs.size(); }

    public String getCompletionStatus() { return completionStatus; }
    public void setCompletionStatus(String completionStatus) { this.completionStatus = completionStatus; }

    public String getAgeRating() { return ageRating; }
    public void setAgeRating(String ageRating) { this.ageRating = ageRating; }

    public Integer getMinChapters() { return minChapters; }
    public void setMinChapters(Integer minChapters) { this.minChapters = minChapters; }

    public Integer getMaxChapters() { return maxChapters; }
    public void setMaxChapters(Integer maxChapters) { this.maxChapters = maxChapters; }

    public BigDecimal getMinRating() { return minRating; }
    public void setMinRating(BigDecimal minRating) { this.minRating = minRating; }

    public Integer getAuthorId() { return authorId; }
    public void setAuthorId(Integer authorId) { this.authorId = authorId; }

    public String getOrderBy() { return orderBy; }
    public void setOrderBy(String orderBy) { this.orderBy = orderBy; }

    public int getOffset() { return offset; }
    public void setOffset(int offset) { this.offset = offset; }

    public int getSize() { return size; }
    public void setSize(int size) { this.size = size; }
}
