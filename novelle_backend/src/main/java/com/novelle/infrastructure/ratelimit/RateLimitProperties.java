package com.novelle.infrastructure.ratelimit;

import java.time.Duration;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.rate-limit.*}: fixed-window limits by name, used by {@link RateLimited}.
 *
 * @param enabled switch for tests and local debugging
 * @param limits  limit name (for example "login") to its window
 */
@ConfigurationProperties(prefix = "app.rate-limit")
public record RateLimitProperties(boolean enabled, Map<String, Limit> limits) {

    public RateLimitProperties {
        limits = limits == null ? Map.of() : Map.copyOf(limits);
    }

    /** At most {@code maxRequests} calls per {@code window}. */
    public record Limit(int maxRequests, Duration window) {
    }
}
