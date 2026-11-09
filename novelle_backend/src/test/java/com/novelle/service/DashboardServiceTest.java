package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import com.novelle.dto.ViewSeriesResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.DashboardMapper;
import com.novelle.model.ViewPoint;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DashboardServiceTest {

    private static final int AUTHOR = 5;
    /** 2026-11-09 18:30 UTC is already 2026-11-10 in Vietnam (UTC+7). */
    private static final Instant NOW = Instant.parse("2026-11-09T18:30:00Z");
    private static final LocalDate TODAY_VN = LocalDate.of(2026, 11, 10);

    private DashboardMapper mapper;
    private StudioOwnership ownership;
    private DashboardService service;

    @BeforeEach
    void setUp() {
        mapper = mock(DashboardMapper.class);
        ownership = mock(StudioOwnership.class);
        ViewProperties views = new ViewProperties("views:", Duration.ofMinutes(30), ZoneId.of("Asia/Ho_Chi_Minh"),
                Duration.ofSeconds(60), 1000, 20);
        service = new DashboardService(mapper, ownership, views, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static ViewPoint point(LocalDate d, long views) {
        ViewPoint p = new ViewPoint();
        p.setPeriod(d);
        p.setViews(views);
        return p;
    }

    private static void assertInvalid(ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
    }

    @Test
    void defaultIsTheLast30VietnamDaysWithZerosFilledIn() {
        when(mapper.viewSeries(eq(AUTHOR), eq(null), any(), any(), eq(false)))
                .thenReturn(List.of(point(TODAY_VN, 7), point(TODAY_VN.minusDays(2), 3)));

        ViewSeriesResponse r = service.views(AUTHOR, null, null, null, null);

        assertThat(r.granularity()).isEqualTo("day");
        assertThat(r.to()).isEqualTo(TODAY_VN);
        assertThat(r.from()).isEqualTo(TODAY_VN.minusDays(29));
        assertThat(r.points()).hasSize(30);
        assertThat(r.points().get(29)).isEqualTo(new ViewSeriesResponse.Point(TODAY_VN, 7));
        assertThat(r.points().get(28).views()).isZero();
        assertThat(r.points().get(27).views()).isEqualTo(3);
        assertThat(r.total()).isEqualTo(10);
        verify(mapper).viewSeries(AUTHOR, null, TODAY_VN.minusDays(29), TODAY_VN, false);
    }

    @Test
    void monthlyCoversWholeMonths() {
        when(mapper.viewSeries(anyInt(), any(), any(), any(), anyBoolean()))
                .thenReturn(List.of(point(LocalDate.of(2026, 10, 1), 100)));

        ViewSeriesResponse r = service.views(AUTHOR, LocalDate.of(2026, 9, 15), LocalDate.of(2026, 11, 3), "MONTH", null);

        assertThat(r.from()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(r.to()).isEqualTo(LocalDate.of(2026, 11, 30));
        assertThat(r.points()).extracting(ViewSeriesResponse.Point::date)
                .containsExactly(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 1));
        assertThat(r.total()).isEqualTo(100);
    }

    @Test
    void defaultMonthlyIsTwelveMonths() {
        when(mapper.viewSeries(anyInt(), any(), any(), any(), anyBoolean())).thenReturn(List.of());
        ViewSeriesResponse r = service.views(AUTHOR, null, null, "month", null);
        assertThat(r.points()).hasSize(12);
        assertThat(r.from()).isEqualTo(LocalDate.of(2025, 12, 1));
    }

    @Test
    void rangesAreChecked() {
        assertInvalid(() -> service.views(AUTHOR, LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 1), "day", null));
        assertInvalid(() -> service.views(AUTHOR, LocalDate.of(2025, 1, 1), LocalDate.of(2026, 1, 2), "day", null));
        assertInvalid(() -> service.views(AUTHOR, LocalDate.of(2020, 1, 1), LocalDate.of(2026, 1, 1), "month", null));
        assertInvalid(() -> service.views(AUTHOR, null, null, "week", null));
        verify(mapper, never()).viewSeries(anyInt(), any(), any(), any(), anyBoolean());
    }

    @Test
    void exactly366DaysIsAllowed() {
        when(mapper.viewSeries(anyInt(), any(), any(), any(), anyBoolean())).thenReturn(List.of());
        ViewSeriesResponse r = service.views(AUTHOR, LocalDate.of(2024, 1, 1), LocalDate.of(2024, 12, 31), "day", null);
        assertThat(r.points()).hasSize(366);
    }

    @Test
    void storyFilterChecksOwnership() {
        when(ownership.story(9, AUTHOR)).thenThrow(new ApiException(ErrorCode.STORY_NOT_FOUND));
        assertThatThrownBy(() -> service.views(AUTHOR, null, null, null, 9))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(ErrorCode.STORY_NOT_FOUND));
    }

    @Test
    void storiesUseTheLast30VietnamDays() {
        service.stories(AUTHOR);
        verify(mapper).storyStats(AUTHOR, TODAY_VN.minusDays(29));
    }
}
