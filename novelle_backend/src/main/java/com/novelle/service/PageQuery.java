package com.novelle.service;

import com.novelle.exception.ApiException;

/**
 * Validated paging parameters: {@code page >= 0}, {@code size} 1–50 (default 20), and the page must end within
 * the first {@value #MAX_WINDOW} rows (deep OFFSET pages scan everything before them).
 */
public record PageQuery(int page, int size) {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 50;
    public static final int MAX_WINDOW = 10_000;

    /** Null parameters take their defaults; invalid ones throw 400 VALIDATION_FAILED on the field. */
    public static PageQuery of(Integer page, Integer size) {
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_SIZE : size;
        if (p < 0) {
            throw ApiException.invalidField("page", "must be greater than or equal to 0");
        }
        if (s < 1 || s > MAX_SIZE) {
            throw ApiException.invalidField("size", "must be between 1 and " + MAX_SIZE);
        }
        if (((long) p + 1) * s > MAX_WINDOW) {           // long before the +1: page = Integer.MAX_VALUE must not wrap
            throw ApiException.invalidField("page", "only the first " + MAX_WINDOW + " results can be paged");
        }
        return new PageQuery(p, s);
    }

    /** Rows to skip ({@code OFFSET}). */
    public int offset() {
        return page * size;
    }
}
