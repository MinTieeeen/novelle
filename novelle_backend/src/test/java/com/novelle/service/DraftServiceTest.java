package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import com.novelle.config.StudioProperties;
import com.novelle.model.ChapterDraft;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;

class DraftServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-09T10:00:00.250Z");
    private static final String KEY = "draft:5:88";

    private StringRedisTemplate redis;
    private HashOperations<String, Object, Object> hash;
    private DraftService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        hash = mock(HashOperations.class);
        when(redis.<Object, Object>opsForHash()).thenReturn(hash);
        StudioProperties props = new StudioProperties(Duration.ofDays(7), 200_000, Duration.ofMinutes(1),
                Duration.ofDays(365), Duration.ofSeconds(60));
        service = new DraftService(redis, props, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void saveWritesTheHashAndSetsTheTtl() {
        assertThat(service.save(5, 88L, "Tiêu đề", "<p>x</p>")).contains(NOW);
        verify(hash).putAll(KEY, Map.of("title", "Tiêu đề", "content", "<p>x</p>",
                "savedAt", String.valueOf(NOW.toEpochMilli())));
        verify(redis).expire(KEY, Duration.ofDays(7));
    }

    @Test
    void saveFailsOpen() {
        doThrow(new RedisConnectionFailureException("down")).when(hash).putAll(anyString(), anyMap());
        assertThat(service.save(5, 88L, "t", "c")).isEmpty();
    }

    @Test
    void findReadsTheHash() {
        when(hash.entries(KEY)).thenReturn(Map.of("title", "t", "content", "c", "savedAt", String.valueOf(NOW.toEpochMilli())));
        assertThat(service.find(5, 88L)).contains(new ChapterDraft("t", "c", NOW));
    }

    @Test
    void missingOrBrokenDraftIsEmpty() {
        when(hash.entries(KEY)).thenReturn(Map.of());
        assertThat(service.find(5, 88L)).isEmpty();
        when(hash.entries(KEY)).thenReturn(Map.of("title", "t", "content", "c", "savedAt", "not-a-number"));
        assertThat(service.find(5, 88L)).isEmpty();
        when(hash.entries(KEY)).thenThrow(new RedisConnectionFailureException("down"));
        assertThat(service.find(5, 88L)).isEmpty();
    }

    @Test
    void deleteFailsOpen() {
        when(redis.delete(KEY)).thenThrow(new RedisConnectionFailureException("down"));
        service.delete(5, 88L);
        verify(redis).delete(KEY);
    }
}
