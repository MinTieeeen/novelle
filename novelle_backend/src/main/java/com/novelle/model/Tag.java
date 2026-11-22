package com.novelle.model;

/** Row of dbo.Tag; {@code usageCount} is only read by the tag suggestions (0 on a story's tag list). */
public class Tag {

    private int tagId;
    private String name;
    private String slug;
    private int usageCount;

    public int getTagId() { return tagId; }
    public void setTagId(int tagId) { this.tagId = tagId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public int getUsageCount() { return usageCount; }
    public void setUsageCount(int usageCount) { this.usageCount = usageCount; }
}
