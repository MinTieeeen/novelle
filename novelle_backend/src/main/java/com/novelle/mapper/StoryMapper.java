package com.novelle.mapper;

import java.util.List;

import com.novelle.model.ChapterToc;
import com.novelle.model.GenreRef;
import com.novelle.model.StoryDetail;
import com.novelle.model.Tag;
import com.novelle.model.VolumeToc;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Public story detail page. SQL: resources/mapper/StoryMapper.xml.
 * Only {@link #findPublicIdBySlug} checks visibility; the other statements are called with an id it returned.
 */
@Mapper
public interface StoryMapper {

    /** Id of a PUBLISHED, not deleted story, or null (unknown slug, draft, hidden, deleted). */
    Integer findPublicIdBySlug(@Param("slug") String slug);

    StoryDetail findDetail(@Param("storyId") int storyId);

    /** Primary genre first, then SortOrder. */
    List<GenreRef> findGenres(@Param("storyId") int storyId);

    List<Tag> findTags(@Param("storyId") int storyId);

    /** Volumes that still have published chapters, each with those chapters in order. */
    List<VolumeToc> findVolumesWithChapters(@Param("storyId") int storyId);

    /** Published chapters that belong to no volume. */
    List<ChapterToc> findLooseChapters(@Param("storyId") int storyId);
}
