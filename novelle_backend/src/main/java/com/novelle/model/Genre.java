package com.novelle.model;

/** Row of dbo.Genre plus the number of public stories that have it (GET /api/genres). */
public class Genre {

    private int genreId;
    private String name;
    private String slug;
    private String description;
    private int storyCount;

    public int getGenreId() { return genreId; }
    public void setGenreId(int genreId) { this.genreId = genreId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getStoryCount() { return storyCount; }
    public void setStoryCount(int storyCount) { this.storyCount = storyCount; }
}
