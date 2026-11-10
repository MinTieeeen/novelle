package com.novelle.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import com.novelle.dto.GenreStatsResponse;
import com.novelle.dto.StatsOverviewResponse;
import com.novelle.dto.TopAuthorsResponse;
import com.novelle.dto.UserGrowthResponse;
import com.novelle.dto.ViewSeriesResponse;
import com.novelle.exception.ApiException;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.infrastructure.views.ViewProperties;
import com.novelle.mapper.StatsMapper;
import com.novelle.model.StatsRows.ContentTotals;
import com.novelle.model.StatsRows.MonthRoleCount;
import com.novelle.model.StatsRows.RoleStatusCount;
import com.novelle.model.StatsRows.StoryStatusCount;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * System-wide statistics (F13, docs/module-admin.md S1–S5). A call with the default parameters is cached in
 * {@code cache:stats:{name}} for {@code app.cache.ttl.stats} and never evicted (D6); a call with explicit
 * parameters reads SQL Server directly. Dates are Vietnam calendar days ({@code app.views.zone}).
 */
@Service
public class StatsService {

    static final List<String> ROLES = List.of("READER", "AUTHOR", "ADMIN");
    static final List<String> STORY_STATUSES = List.of("PUBLISHED", "DRAFT", "HIDDEN");
    static final int DEFAULT_MONTHS = 12;
    static final int MAX_MONTHS = 60;
    static final int DEFAULT_TOP = 20;
    static final int MAX_TOP = 50;

    private final StatsMapper statsMapper;
    private final CacheService cache;
    private final CacheTtlProperties ttl;
    private final ViewProperties views;
    private final Clock clock;

    @Autowired
    public StatsService(StatsMapper statsMapper, CacheService cache, CacheTtlProperties ttl, ViewProperties views) {
        this(statsMapper, cache, ttl, views, Clock.systemUTC());
    }

    StatsService(StatsMapper statsMapper, CacheService cache, CacheTtlProperties ttl, ViewProperties views,
                 Clock clock) {
        this.statsMapper = statsMapper;
        this.cache = cache;
        this.ttl = ttl;
        this.views = views;
        this.clock = clock;
    }

    /** S1 (always the default: no parameter). */
    @Transactional(readOnly = true)
    public StatsOverviewResponse overview() {
        return cached("overview", StatsOverviewResponse.class, this::loadOverview);
    }

    /** S2: like the author dashboard (ViewSeriesBuilder), over every story. */
    @Transactional(readOnly = true)
    public ViewSeriesResponse views(LocalDate from, LocalDate to, String granularity) {
        Supplier<ViewSeriesResponse> load = () -> ViewSeriesBuilder.build(from, to, granularity, today(), null,
                statsMapper::viewSeries);
        return from == null && to == null && granularity == null
                ? cached("views", ViewSeriesResponse.class, load) : load.get();
    }

    /** S3. */
    @Transactional(readOnly = true)
    public GenreStatsResponse genres() {
        return cached("genres", GenreStatsResponse.class, () -> new GenreStatsResponse(
                statsMapper.genreStats().stream().map(g -> new GenreStatsResponse.Item(g.getGenreId(), g.getName(),
                        g.getSlug(), g.getStoryCount(), g.getTotalViews())).toList()));
    }

    /** S4: the last {@code months} months, the current one included. */
    @Transactional(readOnly = true)
    public UserGrowthResponse users(Integer months) {
        if (months != null && (months < 1 || months > MAX_MONTHS)) {
            throw ApiException.invalidField("months", "must be between 1 and " + MAX_MONTHS);
        }
        int n = months == null ? DEFAULT_MONTHS : months;
        Supplier<UserGrowthResponse> load = () -> loadUsers(n);
        return months == null ? cached("users", UserGrowthResponse.class, load) : load.get();
    }

    /** S5. */
    @Transactional(readOnly = true)
    public TopAuthorsResponse topAuthors(Integer limit) {
        if (limit != null && (limit < 1 || limit > MAX_TOP)) {
            throw ApiException.invalidField("limit", "must be between 1 and " + MAX_TOP);
        }
        int n = limit == null ? DEFAULT_TOP : limit;
        Supplier<TopAuthorsResponse> load = () -> {
            BigDecimal avg = statsMapper.averageAuthorViews();
            return new TopAuthorsResponse(avg == null ? BigDecimal.ZERO : avg,
                    statsMapper.topAuthors(n).stream().map(a -> new TopAuthorsResponse.Item(a.getAuthorId(),
                            a.getPenName(), a.isVerified(), a.getStoryCount(), a.getTotalViews(),
                            a.getFollowerCount())).toList());
        };
        return limit == null ? cached("top-authors", TopAuthorsResponse.class, load) : load.get();
    }

    /* ---------- loaders ---------- */

    private StatsOverviewResponse loadOverview() {
        Map<String, Long> byRole = zeros(ROLES);
        long users = 0;
        long banned = 0;
        for (RoleStatusCount c : statsMapper.usersByRoleStatus()) {
            byRole.merge(c.getRole(), c.getTotal(), Long::sum);
            users += c.getTotal();
            if ("BANNED".equals(c.getStatus())) {
                banned += c.getTotal();
            }
        }
        Map<String, Long> byStatus = zeros(STORY_STATUSES);
        long stories = 0;
        for (StoryStatusCount c : statsMapper.storiesByStatus()) {
            byStatus.merge(c.getPublishStatus(), c.getTotal(), Long::sum);
            stories += c.getTotal();
        }
        ContentTotals t = statsMapper.contentTotals();
        return new StatsOverviewResponse(new StatsOverviewResponse.Users(users, byRole, banned),
                new StatsOverviewResponse.Stories(stories, byStatus),
                new StatsOverviewResponse.Chapters(t.getPublishedChapters(), t.getTotalChapters()),
                t.getTotalWords(), t.getTotalViews(), t.getTotalRatings());
    }

    private UserGrowthResponse loadUsers(int months) {
        LocalDate firstMonth = today().withDayOfMonth(1).minusMonths(months - 1L);
        LocalDateTime sinceUtc = LocalDateTime.ofInstant(firstMonth.atStartOfDay(views.zone()).toInstant(),
                ZoneOffset.UTC);
        int offsetMinutes = views.zone().getRules().getOffset(clock.instant()).getTotalSeconds() / 60;

        Map<LocalDate, Map<String, Long>> found = new HashMap<>();
        for (MonthRoleCount c : statsMapper.newUsersByMonth(sinceUtc, offsetMinutes)) {
            found.computeIfAbsent(c.getMonth(), m -> zeros(ROLES)).merge(c.getRole(), c.getTotal(), Long::sum);
        }
        List<UserGrowthResponse.Month> result = new ArrayList<>();
        for (int i = 0; i < months; i++) {
            LocalDate m = firstMonth.plusMonths(i);
            Map<String, Long> byRole = found.getOrDefault(m, zeros(ROLES));
            long total = byRole.values().stream().mapToLong(Long::longValue).sum();
            result.add(new UserGrowthResponse.Month(m, byRole, total));
        }
        return new UserGrowthResponse(result);
    }

    /* ---------- helpers ---------- */

    private <T> T cached(String name, Class<T> type, Supplier<T> loader) {
        return cache.getOrLoad(CacheKeys.stats(name), ttl.stats(), type, loader);
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), views.zone());
    }

    private static Map<String, Long> zeros(List<String> keys) {
        Map<String, Long> m = new LinkedHashMap<>();
        keys.forEach(k -> m.put(k, 0L));
        return m;
    }
}
