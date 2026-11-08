package com.novelle.infrastructure.views;

import java.time.Duration;
import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.views.*}: view counting on Redis and the write-behind flush to SQL Server (G6,
 * docs/module-reading.md section 5.2).
 *
 * @param keyPrefix       prefix of every view key, {@code views:} by default; tests use {@code it:views:} so the
 *                        flush job of a running app never picks up (and commits) their counters
 *                        (env {@code VIEWS_KEY_PREFIX})
 * @param seenTtl         window in which the same viewer counts once per chapter (env {@code VIEWS_SEEN_TTL})
 * @param zone            time zone of the calendar day a view belongs to (env {@code VIEWS_ZONE})
 * @param flushInterval   delay between two flush runs (env {@code VIEWS_FLUSH_INTERVAL})
 * @param flushBatch      dirty members taken per batch (env {@code VIEWS_FLUSH_BATCH})
 * @param flushMaxBatches batches per run; the rest waits for the next run (env {@code VIEWS_FLUSH_MAX_BATCHES})
 */
@ConfigurationProperties(prefix = "app.views")
public record ViewProperties(String keyPrefix, Duration seenTtl, ZoneId zone, Duration flushInterval,
        int flushBatch, int flushMaxBatches) {

    public ViewProperties {
        if (keyPrefix == null || keyPrefix.isBlank()) {
            throw new IllegalArgumentException("app.views.key-prefix must not be blank");
        }
        if (seenTtl == null || seenTtl.toSeconds() < 1) {
            throw new IllegalArgumentException("app.views.seen-ttl must be at least 1 second");
        }
        if (zone == null) {
            throw new IllegalArgumentException("app.views.zone is required");
        }
        if (flushInterval == null || flushInterval.isNegative() || flushInterval.isZero()) {
            throw new IllegalArgumentException("app.views.flush-interval must be positive");
        }
        if (flushBatch < 1 || flushMaxBatches < 1) {
            throw new IllegalArgumentException("app.views.flush-batch and flush-max-batches must be at least 1");
        }
    }
}
