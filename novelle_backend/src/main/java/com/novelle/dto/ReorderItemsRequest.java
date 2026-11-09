package com.novelle.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Body of PUT /api/reading-lists/{listId}/items/order: every public story of the list, in the new order
 * (docs/module-library.md T8). Hidden stories keep their relative order after them.
 */
public record ReorderItemsRequest(
        @NotNull @Size(max = 500) List<@NotNull @Positive Integer> storyIds) {
}
