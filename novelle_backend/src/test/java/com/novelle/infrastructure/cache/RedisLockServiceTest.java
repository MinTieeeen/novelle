package com.novelle.infrastructure.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;

import com.novelle.infrastructure.cache.RedisLockService.Lock;
import com.novelle.infrastructure.cache.RedisLockService.State;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

class RedisLockServiceTest {

    private static final String KEY = "lock:author-request:1";
    private static final Duration TTL = Duration.ofSeconds(5);

    private StringRedisTemplate redis;
    private ValueOperations<String, String> ops;
    private RedisLockService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        ops = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(ops);
        service = new RedisLockService(redis);
    }

    @Test
    void lockTakenWithSetNxAndAToken() {
        when(ops.setIfAbsent(eq(KEY), anyString(), eq(TTL))).thenReturn(true);

        Lock lock = service.tryLock(KEY, TTL);

        assertThat(lock.state()).isEqualTo(State.ACQUIRED);
        assertThat(lock.token()).isNotBlank();
        assertThat(lock.mayProceed()).isTrue();
    }

    @Test
    void lockHeldByAnotherIsBusy() {
        when(ops.setIfAbsent(eq(KEY), anyString(), eq(TTL))).thenReturn(false);

        Lock lock = service.tryLock(KEY, TTL);

        assertThat(lock.state()).isEqualTo(State.BUSY);
        assertThat(lock.mayProceed()).isFalse();
    }

    @Test
    void redisDownSkipsTheLock() {
        when(ops.setIfAbsent(eq(KEY), anyString(), eq(TTL))).thenThrow(new RedisConnectionFailureException("down"));

        Lock lock = service.tryLock(KEY, TTL);

        assertThat(lock.state()).isEqualTo(State.SKIPPED);
        assertThat(lock.mayProceed()).isTrue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void releaseComparesTheToken() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class))).thenReturn(1L);

        service.release(new Lock(KEY, "my-token", State.ACQUIRED));

        verify(redis).execute(any(RedisScript.class), eq(List.of(KEY)), eq("my-token"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void busyOrSkippedLocksAreNotReleased() {
        service.release(new Lock(KEY, null, State.BUSY));
        service.release(new Lock(KEY, null, State.SKIPPED));

        verify(redis, never()).execute(any(RedisScript.class), anyList(), any(Object[].class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void releaseNeverThrows() {
        when(redis.execute(any(RedisScript.class), anyList(), any(Object[].class)))
                .thenThrow(new RedisConnectionFailureException("down"));

        assertThatCode(() -> service.release(new Lock(KEY, "t", State.ACQUIRED))).doesNotThrowAnyException();
    }
}
