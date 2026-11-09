package com.novelle.mapper;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import com.novelle.model.AuthorDashboardStats;
import com.novelle.model.FollowerRow;
import com.novelle.model.FollowerSummary;
import com.novelle.model.StoryFollowRow;
import com.novelle.model.StoryStats;
import com.novelle.model.ViewPoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Author dashboard (F10): aggregates over my stories. SQL: resources/mapper/DashboardMapper.xml. */
@Mapper
public interface DashboardMapper {

    /** Row of vw_AuthorStats for the author. */
    AuthorDashboardStats overview(@Param("authorId") int authorId);

    /**
     * Views summed per day, or per month ({@code monthly}, period = first day of the month), between {@code from}
     * and {@code to} inclusive (Vietnam calendar days, as stored in StoryViewDaily). {@code storyId} null = all my
     * stories. Periods without views are absent; the service fills them with 0.
     */
    List<ViewPoint> viewSeries(@Param("authorId") int authorId, @Param("storyId") Integer storyId,
                               @Param("from") LocalDate from, @Param("to") LocalDate to,
                               @Param("monthly") boolean monthly);

    /** My stories that are not deleted, most viewed first, with views since {@code since} and the above-average flag. */
    List<StoryStats> storyStats(@Param("authorId") int authorId, @Param("since") LocalDate since);

    FollowerSummary followerSummary(@Param("authorId") int authorId, @Param("since") LocalDateTime since);

    List<FollowerRow> recentFollowers(@Param("authorId") int authorId, @Param("limit") int limit);

    List<StoryFollowRow> topFollowedStories(@Param("authorId") int authorId, @Param("limit") int limit);
}
