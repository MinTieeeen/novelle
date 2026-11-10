package com.novelle.mapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.novelle.model.StatsRows.ContentTotals;
import com.novelle.model.StatsRows.GenreStat;
import com.novelle.model.StatsRows.MonthRoleCount;
import com.novelle.model.StatsRows.RoleStatusCount;
import com.novelle.model.StatsRows.StoryStatusCount;
import com.novelle.model.StatsRows.TopAuthor;
import com.novelle.model.ViewPoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** System-wide statistics of the administrators (F13, docs/module-admin.md S1–S5). Read only. SQL: resources/mapper/StatsMapper.xml. */
@Mapper
public interface StatsMapper {

    List<RoleStatusCount> usersByRoleStatus();

    /** Stories that are not deleted, per PublishStatus. */
    List<StoryStatusCount> storiesByStatus();

    ContentTotals contentTotals();

    /** Every view of StoryViewDaily per day or month (period = first day) in {@code [from, to]}. */
    List<ViewPoint> viewSeries(@Param("from") LocalDate from, @Param("to") LocalDate to,
                               @Param("monthly") boolean monthly);

    /** Every genre with its public stories and their views, genres without stories included. */
    List<GenreStat> genreStats();

    /**
     * Users created since {@code sinceUtc}, per Vietnam month and role. {@code offsetMinutes} moves the UTC
     * CreatedAt to local time (Vietnam has no daylight saving time, so one offset is exact).
     */
    List<MonthRoleCount> newUsersByMonth(@Param("sinceUtc") LocalDateTime sinceUtc,
                                         @Param("offsetMinutes") int offsetMinutes);

    /** Average of the per-author view totals, over authors with at least one story that is not deleted. */
    BigDecimal averageAuthorViews();

    /** Authors whose total views are above {@link #averageAuthorViews()}, most viewed first. */
    List<TopAuthor> topAuthors(@Param("limit") int limit);
}
