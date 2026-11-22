package com.novelle.infrastructure.views;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;

class ViewCounterServiceTest {

    private static final ViewProperties PROPS = new ViewProperties("views:", Duration.ofMinutes(30),
            ZoneId.of("Asia/Ho_Chi_Minh"), Duration.ofSeconds(60), 1000, 20);

    private final ViewCounterStore store = mock(ViewCounterStore.class);

    private ViewCounterService at(String instant) {
        return new ViewCounterService(store, PROPS, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }

    @Test
    void dayIsTakenInVietnamTimeJustBeforeMidnight() {
        // 16:59:59Z = 23:59:59 in Vietnam (UTC+7): still the 8th
        at("2026-11-08T16:59:59Z").record(1, 2, null, "203.0.113.7");
        verify(store).record(1, 2, LocalDate.of(2026, 11, 8), "ip203.0.113.7", Duration.ofMinutes(30));
    }

    @Test
    void dayIsTakenInVietnamTimeAtMidnight() {
        // 17:00:00Z = 00:00:00 of the 9th in Vietnam, although it is still the 8th in UTC
        at("2026-11-08T17:00:00Z").record(1, 2, null, "203.0.113.7");
        verify(store).record(1, 2, LocalDate.of(2026, 11, 9), "ip203.0.113.7", Duration.ofMinutes(30));
    }

    @Test
    void loggedInViewerIsTheUserNotTheIp() {
        at("2026-11-08T03:00:00Z").record(1, 2, 17, "203.0.113.7");
        verify(store).record(eq(1), eq(2L), any(), eq("u17"), any());
    }

    @Test
    void returnsWhetherTheViewWasCounted() {
        when(store.record(anyInt(), anyLong(), any(), anyString(), any())).thenReturn(true, false);
        ViewCounterService service = at("2026-11-08T03:00:00Z");

        assertThat(service.record(1, 2, 17, "x")).isTrue();
        assertThat(service.record(1, 2, 17, "x")).isFalse();
    }

    @Test
    void redisFailureIsSwallowed() {
        when(store.record(anyInt(), anyLong(), any(), anyString(), any()))
                .thenThrow(new RedisConnectionFailureException("down"));

        assertThat(at("2026-11-08T03:00:00Z").record(1, 2, null, "203.0.113.7")).isFalse();
    }
}
