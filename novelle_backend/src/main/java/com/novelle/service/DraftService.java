package com.novelle.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import com.novelle.config.StudioProperties;
import com.novelle.infrastructure.cache.DraftKeys;
import com.novelle.model.ChapterDraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Autosaved chapter drafts in the Redis hash {@code draft:{userId}:{chapterId}} (fields title, content, savedAt in
 * epoch milliseconds), TTL {@code app.studio.draft-ttl}, refreshed on every autosave (module-studio D8). Never
 * written to SQL Server. Fails open: a Redis error is logged and the editor keeps working.
 */
@Service
public class DraftService {

    private static final Logger log = LoggerFactory.getLogger(DraftService.class);

    private final StringRedisTemplate redis;
    private final StudioProperties properties;
    private final Clock clock;

    @Autowired
    public DraftService(StringRedisTemplate redis, StudioProperties properties) {
        this(redis, properties, Clock.systemUTC());
    }

    DraftService(StringRedisTemplate redis, StudioProperties properties, Clock clock) {
        this.redis = redis;
        this.properties = properties;
        this.clock = clock;
    }

    /** Stores the draft; empty when Redis is unavailable. */
    public Optional<Instant> save(int userId, long chapterId, String title, String content) {
        Instant now = clock.instant();
        String key = DraftKeys.chapter(userId, chapterId);
        try {
            redis.opsForHash().putAll(key, Map.of(
                    DraftKeys.FIELD_TITLE, title,
                    DraftKeys.FIELD_CONTENT, content,
                    DraftKeys.FIELD_SAVED_AT, String.valueOf(now.toEpochMilli())));
            redis.expire(key, properties.draftTtl());
            return Optional.of(now);
        } catch (DataAccessException ex) {
            log.warn("Draft of chapter {} not saved, Redis unavailable: {}", chapterId, ex.getMessage());
            return Optional.empty();
        }
    }

    /** The draft, or empty when there is none, it cannot be read, or Redis is unavailable. */
    public Optional<ChapterDraft> find(int userId, long chapterId) {
        try {
            Map<Object, Object> h = redis.opsForHash().entries(DraftKeys.chapter(userId, chapterId));
            Object title = h.get(DraftKeys.FIELD_TITLE);
            Object content = h.get(DraftKeys.FIELD_CONTENT);
            Object savedAt = h.get(DraftKeys.FIELD_SAVED_AT);
            if (title == null || content == null || savedAt == null) {
                return Optional.empty();
            }
            return Optional.of(new ChapterDraft(title.toString(), content.toString(),
                    Instant.ofEpochMilli(Long.parseLong(savedAt.toString()))));
        } catch (DataAccessException | NumberFormatException ex) {
            log.warn("Draft of chapter {} not read: {}", chapterId, ex.getMessage());
            return Optional.empty();
        }
    }

    public void delete(int userId, long chapterId) {
        try {
            redis.delete(DraftKeys.chapter(userId, chapterId));
        } catch (DataAccessException ex) {
            log.warn("Draft of chapter {} not deleted, it expires by itself: {}", chapterId, ex.getMessage());
        }
    }
}
