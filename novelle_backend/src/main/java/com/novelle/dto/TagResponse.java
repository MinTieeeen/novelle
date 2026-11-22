package com.novelle.dto;

import com.novelle.model.Tag;

/** GET /api/tags: a tag suggestion. */
public record TagResponse(int tagId, String name, String slug, int usageCount) {

    public static TagResponse from(Tag t) {
        return new TagResponse(t.getTagId(), t.getName(), t.getSlug(), t.getUsageCount());
    }
}
