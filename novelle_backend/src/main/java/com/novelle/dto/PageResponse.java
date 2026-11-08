package com.novelle.dto;

import java.util.List;

/** One page of a list, shared by every paged endpoint: {@code { items, page, size, totalElements, totalPages }}. */
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long totalElements) {
        int totalPages = (int) ((totalElements + size - 1) / size);
        return new PageResponse<>(List.copyOf(items), page, size, totalElements, totalPages);
    }
}
