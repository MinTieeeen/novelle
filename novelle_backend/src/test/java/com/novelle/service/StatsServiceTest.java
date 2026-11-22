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

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Supplier;

import com.novelle.dto.StatsOverviewResponse;
import com.novelle.dto.UserGrowthResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.StatsMapper;
import com.novelle.model.StatsRows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StatsServiceTest {

    /** 2026-11-30 18:00 UTC is already 2026-12-01 in Vietnam. */
    private static final Instant NOW = Instant.parse("2026-11-30T18:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(5);

    private StatsMapper mapper;
    private CacheService cache;
    private StatsService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StatsMapper.class);
        cache = mock(CacheService.class);
        // the cache always misses and runs the loader
        when(cache.getOrLoad(any(), any(), any(Class.class), any())).thenAnswer(inv -> inv.<Supplier<?>>getArgument(3).get());
        CacheTtlProperties ttl = new CacheTtlProperties(Duration.ofHours(1), Duration.ofMinutes(2),
                Duration.ofMinutes(10), Duration.ofMinutes(30), TTL);
        ViewProperties views = new ViewProperties("views:", Duration.ofMinutes(30), ZoneId.of("Asia/Ho_Chi_Minh"),
                Duration.ofSeconds(60), 1000, 20);
        service = new StatsService(mapper, cache, ttl, views, Clock.fixed(NOW, ZoneOffset.UTC));
        when(mapper.contentTotals()).thenReturn(new StatsRows.ContentTotals());
    }

    private static StatsRows.RoleStatusCount rs(String role, String status, long total) {
        StatsRows.RoleStatusCount c = new StatsRows.RoleStatusCount();
        c.setRole(role);
        c.setStatus(status);
        c.setTotal(total);
        return c;
    }

    @Test
    void overviewSumsRolesAndCountsBannedUsers() {
        when(mapper.usersByRoleStatus()).thenReturn(List.of(rs("READER", "ACTIVE", 10), rs("READER", "BANNED", 2),
                rs("ADMIN", "ACTIVE", 1)));

        StatsOverviewResponse o = service.overview();

        assertThat(o.users().total()).isEqualTo(13);
        assertThat(o.users().banned()).isEqualTo(2);
        assertThat(o.users().byRole()).containsExactly(
                org.assertj.core.api.Assertions.entry("READER", 12L),
                org.assertj.core.api.Assertions.entry("AUTHOR", 0L),
                org.assertj.core.api.Assertions.entry("ADMIN", 1L));
        assertThat(o.stories().byStatus()).containsKeys("PUBLISHED", "DRAFT", "HIDDEN");
        verify(cache).getOrLoad(eq("cache:stats:overview"), eq(TTL), eq(StatsOverviewResponse.class), any());
    }

    @Test
    void onlyCallsWithoutParametersAreCached() {
        when(mapper.viewSeries(any(), any(), anyBoolean())).thenReturn(List.of());
        service.views(null, null, null);
        service.views(LocalDate.of(2026, 11, 1), null, null);
        verify(cache).getOrLoad(eq("cache:stats:views"), any(), any(Class.class), any());

        service.topAuthors(5);
        verify(cache, never()).getOrLoad(eq("cache:stats:top-authors"), any(), any(Class.class), any());
        verify(mapper).topAuthors(5);
    }

    @Test
    void usersCoverEveryMonthInVietnamTimeWithZeros() {
        StatsRows.MonthRoleCount c = new StatsRows.MonthRoleCount();
        c.setMonth(LocalDate.of(2026, 12, 1));
        c.setRole("AUTHOR");
        c.setTotal(3);
        when(mapper.newUsersByMonth(any(), anyInt())).thenReturn(List.of(c));

        UserGrowthResponse r = service.users(3);

        assertThat(r.months()).extracting(UserGrowthResponse.Month::month)
                .containsExactly(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 1), LocalDate.of(2026, 12, 1));
        assertThat(r.months().get(0).total()).isZero();
        assertThat(r.months().get(2).byRole().get("AUTHOR")).isEqualTo(3);
        // 2026-10-01 00:00 Vietnam = 2026-09-30 17:00 UTC; Vietnam is UTC+7 (420 minutes)
        verify(mapper).newUsersByMonth(LocalDateTime.of(2026, 9, 30, 17, 0), 420);
    }

    @Test
    void parameterLimitsAreChecked() {
        for (Runnable call : List.<Runnable>of(() -> service.users(0), () -> service.users(61),
                () -> service.topAuthors(0), () -> service.topAuthors(51),
                () -> service.views(null, null, "week"))) {
            assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                    ex -> assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
        }
    }

    @Test
    void noAuthorMeansAZeroAverage() {
        when(mapper.averageAuthorViews()).thenReturn(null);
        assertThat(service.topAuthors(null).systemAverageViews()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
