package com.novelle.model;

/** A genre in the admin catalog (G1–G3); {@code storyCount} counts every story that is not deleted. */
public class AdminGenre {

    private int genreId;
    private String name;
    private String slug;
    private String description;
    private int sortOrder;
    private int storyCount;

    public int getGenreId() { return genreId; }
    public void setGenreId(int genreId) { this.genreId = genreId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public int getStoryCount() { return storyCount; }
    public void setStoryCount(int storyCount) { this.storyCount = storyCount; }
}
