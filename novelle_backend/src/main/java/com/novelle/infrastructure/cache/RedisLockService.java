package com.novelle.infrastructure.cache;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

/**
 * Short-lived distributed lock on Redis: {@code SET key <uuid> NX PX ttl} to take it, the Lua script
 * {@code redis/lock-release.lua} (compare-and-delete) to release it. Used only to compare with SQL Server's
 * UPDLOCK in the author-request review (docs/module-author-request.md D1), so it fails open: when Redis is
 * unreachable the caller proceeds without a lock and the database still serialises the work.
 */
@Service
public class RedisLockService {

    private static final Logger log = LoggerFactory.getLogger(RedisLockService.class);

    private static final RedisScript<Long> RELEASE =
            RedisScript.of(new ClassPathResource("redis/lock-release.lua"), Long.class);

    private final StringRedisTemplate redis;

    public RedisLockService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Tries once, never waits. */
    public Lock tryLock(String key, Duration ttl) {
        String token = UUID.randomUUID().toString();
        try {
            Boolean taken = redis.opsForValue().setIfAbsent(key, token, ttl);
            return Boolean.TRUE.equals(taken) ? new Lock(key, token, State.ACQUIRED) : new Lock(key, null, State.BUSY);
        } catch (DataAccessException ex) {
            log.warn("Lock {} skipped, Redis unavailable: {}", key, ex.getMessage());
            return new Lock(key, null, State.SKIPPED);
        }
    }

    /** Releases a lock taken by {@link #tryLock}; does nothing for a busy or skipped one. Never throws. */
    public void release(Lock lock) {
        if (lock.state() != State.ACQUIRED) {
            return;
        }
        try {
            Long released = redis.execute(RELEASE, List.of(lock.key()), lock.token());
            if (released == null || released == 0L) {
                log.warn("Lock {} had already expired before release", lock.key());
            }
        } catch (DataAccessException ex) {
            log.warn("Lock {} not released, it expires by TTL: {}", lock.key(), ex.getMessage());
        }
    }

    public enum State {
        /** This caller holds the lock and must release it. */
        ACQUIRED,
        /** Someone else holds it. */
        BUSY,
        /** Redis was unreachable: proceed without a lock. */
        SKIPPED
    }

    /** Result of {@link #tryLock}; {@code token} is set only when {@link State#ACQUIRED}. */
    public record Lock(String key, String token, State state) {

        /** True when the caller may go on (it holds the lock, or Redis was down). */
        public boolean mayProceed() {
            return state != State.BUSY;
        }
    }
}
