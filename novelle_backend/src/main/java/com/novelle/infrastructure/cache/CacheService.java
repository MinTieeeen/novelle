package com.novelle.infrastructure.cache;

import java.time.Duration;
import java.util.Arrays;
import java.util.function.Supplier;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Cache-aside on Redis: values are stored as JSON strings with a TTL; SQL Server stays the source of truth.
 * <ul>
 *   <li>Redis unreachable: the loader is called and nothing is cached (fail open, like the rate limiter);</li>
 *   <li>an entry that no longer parses (for example after a DTO change): deleted and reloaded;</li>
 *   <li>a {@code null} result (not found) is never cached.</li>
 * </ul>
 * There is no stampede protection: entries are small and TTLs short (docs/module-catalog.md section 12).
 */
@Service
public class CacheService {

    private static final Logger log = LoggerFactory.getLogger(CacheService.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public CacheService(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    public <T> T getOrLoad(String key, Duration ttl, Class<T> type, Supplier<T> loader) {
        return getOrLoad(key, ttl, objectMapper.getTypeFactory().constructType(type), loader);
    }

    /** For generic values such as {@code List<GenreResponse>}. */
    public <T> T getOrLoad(String key, Duration ttl, TypeReference<T> type, Supplier<T> loader) {
        return getOrLoad(key, ttl, objectMapper.getTypeFactory().constructType(type), loader);
    }

    /** Removes entries after the data behind them changed. A Redis failure is logged: the entry then expires by TTL. */
    public void evict(String... keys) {
        if (keys.length == 0) {
            return;
        }
        try {
            redis.delete(Arrays.asList(keys));
        } catch (DataAccessException ex) {
            log.warn("Cache evict failed for {}, entries expire by TTL: {}", Arrays.toString(keys), ex.getMessage());
        }
    }

    private <T> T getOrLoad(String key, Duration ttl, JavaType type, Supplier<T> loader) {
        boolean redisUp = true;
        String json = null;
        try {
            json = redis.opsForValue().get(key);
        } catch (DataAccessException ex) {
            redisUp = false;
            log.warn("Cache read skipped for {}, Redis unavailable: {}", key, ex.getMessage());
        }

        if (json != null) {
            try {
                return objectMapper.readValue(json, type);
            } catch (JsonProcessingException ex) {
                log.warn("Cache entry {} is unreadable, reloading: {}", key, ex.getOriginalMessage());
                evict(key);
            }
        }

        T value = loader.get();
        if (value != null && redisUp) {
            try {
                redis.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
            } catch (DataAccessException | JsonProcessingException ex) {
                log.warn("Cache write skipped for {}: {}", key, ex.getMessage());
            }
        }
        return value;
    }
}
