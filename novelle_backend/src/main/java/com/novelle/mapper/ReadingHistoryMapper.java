package com.novelle.mapper;

import java.math.BigDecimal;
import java.util.List;

import com.novelle.model.HistoryItem;
import com.novelle.model.ReadingProgress;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Reading position per (user, story) (RB5: the primary key allows one row; the service checks that the chapter
 * belongs to the story). SQL: resources/mapper/ReadingHistoryMapper.xml. Also the reading-history list of the
 * library (M4, F5).
 */
@Mapper
public interface ReadingHistoryMapper {

    boolean existsPublicStory(@Param("storyId") int storyId);

    /**
     * Opening a chapter (module-reading D2): same chapter as stored → keep the scroll position; another chapter
     * or no row → move to this chapter with scroll 0. Returns the scroll position after the statement.
     */
    BigDecimal touch(@Param("userId") int userId, @Param("storyId") int storyId,
            @Param("chapterId") long chapterId);

    /** Saves the position sent by the reader (chapter already checked against the story). */
    int upsertProgress(@Param("userId") int userId, @Param("storyId") int storyId,
            @Param("chapterId") long chapterId, @Param("scrollPercent") BigDecimal scrollPercent);

    /** Stored position, or null when there is none or its chapter is no longer public. */
    ReadingProgress findProgress(@Param("userId") int userId, @Param("storyId") int storyId);

    /* ---------- library (M4) ---------- */

    /** My history over public stories only, most recently read first (IX_ReadingHistory_User_Updated). */
    List<HistoryItem> pageHistory(@Param("userId") int userId, @Param("offset") int offset, @Param("size") int size);

    long countHistory(@Param("userId") int userId);

    /** Any story, public or not (docs/module-library.md D2). */
    int deleteHistory(@Param("userId") int userId, @Param("storyId") int storyId);
}
