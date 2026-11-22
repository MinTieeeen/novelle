package com.novelle.infrastructure.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

class RateLimitServiceTest {

    private static final RateLimitProperties.Limit LIMIT = new RateLimitProperties.Limit(2, Duration.ofSeconds(60));

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final RateLimitService service = new RateLimitService(redis);

    @Test
    void allowsUpToTheLimit() {
        doReturn(List.of(2L, 59_000L)).when(redis).execute(any(RedisScript.class), anyList(), anyString());
        RateLimitService.Decision d = service.hit("rl:x:1", LIMIT);
        assertThat(d.allowed()).isTrue();
        assertThat(d.count()).isEqualTo(2);
    }

    @Test
    void deniesAboveTheLimitWithRemainingWindow() {
        doReturn(List.of(3L, 1_500L)).when(redis).execute(any(RedisScript.class), anyList(), anyString());
        RateLimitService.Decision d = service.hit("rl:x:1", LIMIT);
        assertThat(d.allowed()).isFalse();
        assertThat(d.retryAfter()).isEqualTo(Duration.ofMillis(1_500));
    }

    @Test
    void missingTtlFallsBackToTheWindow() {
        doReturn(List.of(5L, -1L)).when(redis).execute(any(RedisScript.class), anyList(), anyString());
        assertThat(service.hit("rl:x:1", LIMIT).retryAfter()).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void redisDownFailsOpen() {
        doThrow(new RedisConnectionFailureException("down"))
                .when(redis).execute(any(RedisScript.class), anyList(), anyString());
        assertThat(service.hit("rl:x:1", LIMIT).allowed()).isTrue();
    }
}
