package com.novelle.mapper;

import java.util.List;

import com.novelle.model.Rating;
import com.novelle.model.RatingStats;
import com.novelle.model.ScoreCount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Ratings and reviews (F6). Story.RatingAvg / RatingCount are kept by trg_Rating.
 * SQL: resources/mapper/RatingMapper.xml.
 */
@Mapper
public interface RatingMapper {

    /** AuthorId of a public story, null when the story is not public (existence + RB4 check in one read). */
    Integer publicStoryAuthorId(@Param("storyId") int storyId);

    /** Insert or update my rating (one row per user and story). */
    int upsert(@Param("userId") int userId, @Param("storyId") int storyId,
               @Param("score") int score, @Param("review") String review);

    int delete(@Param("userId") int userId, @Param("storyId") int storyId);

    Rating findMine(@Param("userId") int userId, @Param("storyId") int storyId);

    /** Newest first; {@code hasReview} true = only ratings with a review text. */
    List<Rating> pageByStory(@Param("storyId") int storyId, @Param("hasReview") boolean hasReview,
                             @Param("offset") int offset, @Param("size") int size);

    long countByStory(@Param("storyId") int storyId, @Param("hasReview") boolean hasReview);

    /** Scores present on the story with their counts (scores without ratings are absent). */
    List<ScoreCount> distribution(@Param("storyId") int storyId);

    /** Values kept by trg_Rating, read from Story (any status), null when the story does not exist. */
    RatingStats storyRatingStats(@Param("storyId") int storyId);
}
