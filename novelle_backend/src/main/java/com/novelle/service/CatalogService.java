package com.novelle.service;

import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.core.type.TypeReference;
import com.novelle.dto.GenreResponse;
import com.novelle.dto.TagResponse;
import com.novelle.exception.ApiException;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.mapper.CatalogMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Genres (cached) and tag suggestions (F2 filters). */
@Service
public class CatalogService {

    static final int DEFAULT_TAG_LIMIT = 20;
    static final int MAX_TAG_LIMIT = 50;
    static final int MAX_TAG_QUERY = 50;

    private static final TypeReference<List<GenreResponse>> GENRE_LIST = new TypeReference<>() {
    };

    private final CatalogMapper catalogMapper;
    private final CacheService cache;
    private final CacheTtlProperties ttl;

    public CatalogService(CatalogMapper catalogMapper, CacheService cache, CacheTtlProperties ttl) {
        this.catalogMapper = catalogMapper;
        this.cache = cache;
        this.ttl = ttl;
    }

    @Transactional(readOnly = true)
    public List<GenreResponse> getGenres() {
        return cache.getOrLoad(CacheKeys.GENRE_LIST, ttl.genre(), GENRE_LIST,
                () -> catalogMapper.findGenresWithCount().stream().map(GenreResponse::from).toList());
    }

    /**
     * Most used tags, optionally those whose name or slug starts with {@code q}. The slug prefix lets a user type
     * without diacritics ("hon nhan" → slug "hon-nhan"); LIKE wildcards in {@code q} are matched literally.
     */
    @Transactional(readOnly = true)
    public List<TagResponse> findTags(String q, Integer limit) {
        int max = limit == null ? DEFAULT_TAG_LIMIT : limit;
        if (max < 1 || max > MAX_TAG_LIMIT) {
            throw ApiException.invalidField("limit", "must be between 1 and " + MAX_TAG_LIMIT);
        }
        String text = q == null ? "" : q.trim();
        if (text.length() > MAX_TAG_QUERY) {
            throw ApiException.invalidField("q", "size must be between 0 and " + MAX_TAG_QUERY);
        }
        String namePrefix = null;
        String slugPrefix = null;
        if (!text.isEmpty()) {
            namePrefix = escapeLike(text) + "%";
            slugPrefix = escapeLike(text.toLowerCase(Locale.ROOT).replaceAll("\\s+", "-")) + "%";
        }
        return catalogMapper.findTags(namePrefix, slugPrefix, max).stream().map(TagResponse::from).toList();
    }

    /** Escapes the LIKE wildcards of SQL Server with {@code \} (the mapper uses {@code ESCAPE '\'}). */
    static String escapeLike(String text) {
        StringBuilder sb = new StringBuilder(text.length() + 4);
        for (char ch : text.toCharArray()) {
            if (ch == '\\' || ch == '%' || ch == '_' || ch == '[') {
                sb.append('\\');
            }
            sb.append(ch);
        }
        return sb.toString();
    }
}
