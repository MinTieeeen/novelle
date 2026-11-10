package com.novelle.mapper;

import java.util.List;

import com.novelle.model.AdminStory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Content moderation (F12, docs/module-admin.md C1–C4). Soft delete reuses {@link StudioStoryMapper#deleteStory}
 * (sp_DeleteStory has an ADMIN branch). SQL: resources/mapper/AdminStoryMapper.xml.
 */
@Mapper
public interface AdminStoryMapper {

    /** Every story that is not deleted, any status; filters may be null. Newest change first. */
    List<AdminStory> pageStories(@Param("publishStatus") String publishStatus,
                                 @Param("likePattern") String likePattern, @Param("authorId") Integer authorId,
                                 @Param("offset") int offset, @Param("size") int size);

    long countStories(@Param("publishStatus") String publishStatus,
                      @Param("likePattern") String likePattern, @Param("authorId") Integer authorId);

    /** One story that is not deleted, or null. */
    AdminStory findStory(@Param("storyId") int storyId);

    /** PUBLISHED → HIDDEN with a reason (D3, D7). 0 = unknown, deleted or not PUBLISHED. */
    int hide(@Param("storyId") int storyId, @Param("reason") String reason);

    /** HIDDEN → PUBLISHED, reason cleared. 0 = unknown, deleted or not HIDDEN. */
    int unhide(@Param("storyId") int storyId);
}
