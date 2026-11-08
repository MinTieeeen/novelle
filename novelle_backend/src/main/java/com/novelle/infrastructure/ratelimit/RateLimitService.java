package com.novelle.infrastructure.ratelimit;

import java.time.Duration;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

/**
 * Fixed-window counters in Redis. INCR and the first PEXPIRE run in one Lua script, so a counter can
 * never be left without a TTL (which would block the caller for good).
 */
@Service
public class RateLimitService {

    private static final Logger log = LoggerFactory.getLogger(RateLimitService.class);

    /** KEYS[1] counter key, ARGV[1] window in ms. Returns {count, remaining ttl in ms}. */
    @SuppressWarnings("rawtypes")
    private static final RedisScript<List> HIT_SCRIPT = RedisScript.of("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then
                redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            return {count, redis.call('PTTL', KEYS[1])}
            """, List.class);

    private final StringRedisTemplate redis;

    public RateLimitService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * Counts one call against {@code key}. When Redis is unreachable the call is allowed (fail open):
     * the limiter protects against abuse and must not take the API down with it.
     */
    public Decision hit(String key, RateLimitProperties.Limit limit) {
        try {
            List<?> result = redis.execute(HIT_SCRIPT, List.of(key), String.valueOf(limit.window().toMillis()));
            long count = ((Number) result.get(0)).longValue();
            long ttlMs = ((Number) result.get(1)).longValue();
            Duration retryAfter = Duration.ofMillis(ttlMs > 0 ? ttlMs : limit.window().toMillis());
            return new Decision(count <= limit.maxRequests(), count, retryAfter);
        } catch (DataAccessException ex) {
            log.warn("Rate limit check skipped, Redis unavailable: {}", ex.getMessage());
            return new Decision(true, 0, Duration.ZERO);
        }
    }

    /** Outcome of one call: {@code retryAfter} is the time left in the current window. */
    public record Decision(boolean allowed, long count, Duration retryAfter) {
    }
}
