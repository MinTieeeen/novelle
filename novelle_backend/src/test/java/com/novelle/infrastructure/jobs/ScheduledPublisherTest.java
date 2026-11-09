package com.novelle.infrastructure.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.StudioChapterMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class ScheduledPublisherTest {

    private static final LocalDateTime DB_NOW = LocalDateTime.of(2026, 11, 9, 10, 0, 0, 500_000_000);

    private StudioChapterMapper mapper;
    private CacheService cache;
    private ScheduledPublisher publisher;

    @BeforeEach
    void setUp() {
        mapper = mock(StudioChapterMapper.class);
        cache = mock(CacheService.class);
        publisher = new ScheduledPublisher(mapper, cache);
        when(mapper.dbNow()).thenReturn(DB_NOW);
    }

    @Test
    void nothingDueTouchesNoCache() {
        when(mapper.publishScheduled()).thenReturn(0);
        assertThat(publisher.publishDue()).isZero();
        verify(mapper, never()).storiesPublishedSince(any());
        verifyNoInteractions(cache);
    }

    @Test
    void evictsTheStoriesPublishedSinceTheDatabaseClock() {
        when(mapper.publishScheduled()).thenReturn(3);
        when(mapper.storiesPublishedSince(DB_NOW)).thenReturn(List.of(7, 9));

        assertThat(publisher.publishDue()).isEqualTo(3);

        verify(cache).evict("cache:story:7", "cache:story:9", "cache:home");
    }

    @Test
    void procedureErrorIsLoggedNotThrown() {
        when(mapper.publishScheduled()).thenThrow(new DataAccessResourceFailureException("RDS down"));
        assertThat(publisher.publishDue()).isZero();
        verifyNoInteractions(cache);
    }

    @Test
    void cacheErrorAfterPublishingIsNotThrown() {
        when(mapper.publishScheduled()).thenReturn(1);
        when(mapper.storiesPublishedSince(DB_NOW)).thenThrow(new DataAccessResourceFailureException("timeout"));
        assertThat(publisher.publishDue()).isEqualTo(1);
    }
}
