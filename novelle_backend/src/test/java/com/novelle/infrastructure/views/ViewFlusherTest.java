package com.novelle.infrastructure.views;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import com.novelle.mapper.ViewFlushMapper;
import com.novelle.model.ViewDelta;
import com.novelle.model.ViewDeltaBatch;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.data.redis.RedisConnectionFailureException;

class ViewFlusherTest {

    private static final LocalDate DAY = LocalDate.of(2026, 11, 8);
    private static final List<ViewDelta> DELTAS =
            List.of(new ViewDelta('S', 1, DAY, 3), new ViewDelta('C', 2, DAY, 3));

    private final ViewCounterStore store = mock(ViewCounterStore.class);
    private final ViewFlushMapper mapper = mock(ViewFlushMapper.class);

    private ViewFlusher flusher(int batch, int maxBatches) {
        return new ViewFlusher(store, mapper, new ViewProperties("views:", Duration.ofMinutes(30),
                ZoneId.of("Asia/Ho_Chi_Minh"), Duration.ofSeconds(60), batch, maxBatches));
    }

    @Test
    void emptyDirtySetDoesNotCallSql() {
        when(store.drain(anyInt())).thenReturn(new ViewCounterStore.Drained(List.of(), 0));

        assertThat(flusher(1000, 20).flush()).isZero();
        verify(mapper, never()).flush(any());
    }

    @Test
    void oneShortBatchIsWrittenThenStops() {
        when(store.drain(1000)).thenReturn(new ViewCounterStore.Drained(DELTAS, 2));

        assertThat(flusher(1000, 20).flush()).isEqualTo(2);
        verify(mapper).flush(new ViewDeltaBatch(DELTAS));
        verify(store, times(1)).drain(1000);
    }

    @Test
    void fullBatchesContinueUpToTheLimit() {
        when(store.drain(2)).thenReturn(new ViewCounterStore.Drained(DELTAS, 2));

        assertThat(flusher(2, 3).flush()).isEqualTo(6);
        verify(store, times(3)).drain(2);
        verify(mapper, times(3)).flush(any());
    }

    @Test
    void batchWithOnlyUnreadableMembersIsSkippedAndDrainingGoesOn() {
        when(store.drain(2)).thenReturn(new ViewCounterStore.Drained(List.of(), 2),
                new ViewCounterStore.Drained(DELTAS, 2), new ViewCounterStore.Drained(List.of(), 0));

        assertThat(flusher(2, 20).flush()).isEqualTo(2);
        verify(mapper, times(1)).flush(any());
    }

    @Test
    void sqlFailurePutsTheCountersBackAndStops() {
        when(store.drain(anyInt())).thenReturn(new ViewCounterStore.Drained(DELTAS, 2));
        doThrow(new QueryTimeoutException("timeout")).when(mapper).flush(any());

        assertThat(flusher(2, 20).flush()).isZero();
        verify(store).restore(DELTAS);
        verify(store, times(1)).drain(anyInt());
    }

    @Test
    void restoreFailureIsLoggedNotThrown() {
        when(store.drain(anyInt())).thenReturn(new ViewCounterStore.Drained(DELTAS, 2));
        doThrow(new QueryTimeoutException("timeout")).when(mapper).flush(any());
        when(store.restore(any())).thenThrow(new RedisConnectionFailureException("down"));

        assertThat(flusher(1000, 20).flush()).isZero();
    }

    @Test
    void redisFailureWhileDrainingDoesNotCallSql() {
        when(store.drain(anyInt())).thenThrow(new RedisConnectionFailureException("down"));

        assertThat(flusher(1000, 20).flush()).isZero();
        verify(mapper, never()).flush(any());
    }
}
