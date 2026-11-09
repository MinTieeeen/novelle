package com.novelle.mapper;

import java.time.LocalDateTime;
import java.util.List;

import com.novelle.model.StudioChapter;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Chapters of my stories (F9) and the scheduled-publish job. Title / Content updates fire trg_Chapter_Revision,
 * which needs {@link SessionContextMapper#setUserId} on the same connection first. SQL: resources/mapper/StudioChapterMapper.xml.
 */
@Mapper
public interface StudioChapterMapper {

    /** Every chapter of the story that is not deleted, by ChapterNo, without Content. */
    List<StudioChapter> listByStory(@Param("storyId") int storyId);

    /**
     * The chapter when its story is mine and neither is deleted, otherwise null. {@code withContent} = also read
     * the NVARCHAR(MAX) body (editor); false for state checks.
     */
    StudioChapter findOwned(@Param("chapterId") long chapterId, @Param("authorId") int authorId,
                            @Param("withContent") boolean withContent);

    /**
     * Inserts a DRAFT chapter with ChapterNo = MAX + 1 over every row of the story, deleted ones included
     * (IX_Chapter_Story_No is unique on them too), read WITH (UPDLOCK, HOLDLOCK) (D7). Reads storyId, volumeId,
     * title, content, wordCount; sets {@code chapter.chapterId}.
     */
    int insert(StudioChapter chapter);

    /** Optimistic save (D4): only while {@code UpdatedAt = version}. 0 = stale. */
    int updateContent(@Param("chapterId") long chapterId, @Param("title") String title,
                      @Param("content") String content, @Param("wordCount") int wordCount,
                      @Param("volumeId") Integer volumeId, @Param("version") LocalDateTime version);

    /** DRAFT / SCHEDULED → SCHEDULED at {@code scheduledAt} (UTC) when the chapter has content. 0 = state changed. */
    int schedule(@Param("chapterId") long chapterId, @Param("scheduledAt") LocalDateTime scheduledAt);

    /** SCHEDULED → DRAFT. 0 = not scheduled any more (published by the job meanwhile, or never scheduled). */
    int unschedule(@Param("chapterId") long chapterId);

    int softDelete(@Param("chapterId") long chapterId);

    /** sp_PublishChapter (RB9): 50004 not found, 50002 not the owner, 50001 already published. */
    void publish(@Param("chapterId") long chapterId, @Param("userId") int userId);

    /** sp_RecalcStoryStats: ChapterCount, WordCount, LastChapterAt from the published chapters. */
    void recalcStoryStats(@Param("storyId") int storyId);

    /** sp_PublishScheduled (RB11, READPAST); returns how many chapters were published. */
    Integer publishScheduled();

    /** Stories with a chapter published at or after {@code since} (cache eviction after the job). */
    List<Integer> storiesPublishedSince(@Param("since") LocalDateTime since);
}
