package com.novelle.infrastructure.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class CacheServiceTest {

    private static final Duration TTL = Duration.ofMinutes(10);

    record Item(int id, String name, Instant at) {
    }

    private StringRedisTemplate redis;
    private ValueOperations<String, String> values;
    private ObjectMapper mapper;
    private CacheService cache;
    private AtomicInteger loads;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        mapper = JsonMapper.builder().findAndAddModules()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS).build();
        cache = new CacheService(redis, mapper);
        loads = new AtomicInteger();
    }

    private Item load() {
        loads.incrementAndGet();
        return new Item(1, "Hoa Nở", Instant.parse("2026-11-05T12:00:00Z"));
    }

    @Test
    void hitReturnsTheCachedValueWithoutLoading() throws Exception {
        when(values.get("k")).thenReturn(mapper.writeValueAsString(new Item(7, "cached", null)));

        Item item = cache.getOrLoad("k", TTL, Item.class, this::load);

        assertThat(item.id()).isEqualTo(7);
        assertThat(loads).hasValue(0);
        verify(values, never()).set(anyString(), anyString(), eq(TTL));
    }

    @Test
    void missLoadsAndStoresJsonWithTtl() throws Exception {
        Item item = cache.getOrLoad("k", TTL, Item.class, this::load);

        assertThat(item.name()).isEqualTo("Hoa Nở");
        verify(values).set("k", mapper.writeValueAsString(item), TTL);
    }

    @Test
    void genericTypesRoundTrip() throws Exception {
        when(values.get("k")).thenReturn(mapper.writeValueAsString(List.of(new Item(1, "a", null))));

        List<Item> items = cache.getOrLoad("k", TTL, new TypeReference<List<Item>>() { }, List::of);

        assertThat(items).singleElement().extracting(Item::name).isEqualTo("a");
    }

    @Test
    void redisDownOnReadLoadsAndDoesNotWrite() {
        when(values.get("k")).thenThrow(new RedisConnectionFailureException("down"));

        Item item = cache.getOrLoad("k", TTL, Item.class, this::load);

        assertThat(item).isNotNull();
        verify(values, never()).set(anyString(), anyString(), eq(TTL));
    }

    @Test
    void redisDownOnWriteStillReturnsTheValue() {
        doThrow(new RedisConnectionFailureException("down")).when(values).set(anyString(), anyString(), eq(TTL));

        assertThat(cache.getOrLoad("k", TTL, Item.class, this::load)).isNotNull();
    }

    @Test
    void unreadableEntryIsEvictedAndReloaded() {
        when(values.get("k")).thenReturn("{not json");

        Item item = cache.getOrLoad("k", TTL, Item.class, this::load);

        assertThat(item.id()).isEqualTo(1);
        assertThat(loads).hasValue(1);
        verify(redis).delete(List.of("k"));
    }

    @Test
    void nullIsNotCached() {
        assertThat(cache.getOrLoad("k", TTL, Item.class, () -> null)).isNull();
        verify(values, never()).set(anyString(), anyString(), eq(TTL));
    }

    @Test
    void evictSurvivesRedisFailure() {
        when(redis.delete(anyList())).thenThrow(new RedisConnectionFailureException("down"));

        cache.evict("a", "b");          // no exception

        verify(redis).delete(List.of("a", "b"));
    }

    @Test
    void evictWithoutKeysDoesNothing() {
        cache.evict();
        verify(redis, never()).delete(anyList());
    }
}
