package com.novelle.infrastructure.cache;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.cache.ttl.*}: time to live of each cache entry (env {@code CACHE_*_TTL}).
 *
 * @param genre {@link CacheKeys#GENRE_LIST}
 * @param home  {@link CacheKeys#HOME}
 * @param story {@link CacheKeys#story(int)}
 */
@ConfigurationProperties(prefix = "app.cache.ttl")
public record CacheTtlProperties(Duration genre, Duration home, Duration story) {
}
