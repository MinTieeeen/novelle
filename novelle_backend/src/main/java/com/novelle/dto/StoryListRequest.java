package com.novelle.dto;

/**
 * Query parameters of a plain story list (GET /api/authors/{authorId}/stories): sort and paging only.
 * Checked by StorySearchService (sort whitelist without {@code relevance}, page ≥ 0, size 1–50).
 *
 * @param sort updated (default), newest, views, rating, follows
 * @param page from 0
 * @param size 1–50, default 20
 */
public record StoryListRequest(String sort, Integer page, Integer size) {
}
