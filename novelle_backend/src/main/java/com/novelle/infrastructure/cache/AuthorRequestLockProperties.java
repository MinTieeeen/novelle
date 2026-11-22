package com.novelle.infrastructure.cache;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.author-request.redis-lock.*}: the optional Redis lock taken before reviewing an author request
 * (docs/module-author-request.md D1). Off by default; the stored procedures' UPDLOCK is the real guard.
 *
 * @param enabled take the lock (env {@code APP_DEMO_REDIS_LOCK})
 * @param ttl     lock lifetime, after which it expires even if never released (env {@code AUTHOR_REQUEST_LOCK_TTL})
 */
@ConfigurationProperties(prefix = "app.author-request.redis-lock")
public record AuthorRequestLockProperties(boolean enabled, Duration ttl) {
}
