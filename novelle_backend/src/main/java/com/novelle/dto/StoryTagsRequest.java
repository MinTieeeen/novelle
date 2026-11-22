package com.novelle.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of PUT /api/studio/stories/{id}/tags (S6). The service normalises the names, merges duplicates and then
 * enforces at most 10 (RB6); an empty list removes every tag.
 */
public record StoryTagsRequest(@NotNull @Size(max = 30) List<String> tags) {
}
