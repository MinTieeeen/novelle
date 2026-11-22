package com.novelle.model;

/** A genre attached to a story: the primary genre of a card, or one entry of a story's genre list. */
public class GenreRef {

    private int genreId;
    private String name;
    private String slug;
    private boolean isPrimary;

    public int getGenreId() { return genreId; }
    public void setGenreId(int genreId) { this.genreId = genreId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public boolean isPrimary() { return isPrimary; }
    public void setIsPrimary(boolean isPrimary) { this.isPrimary = isPrimary; }
}
