package com.novelle.mapper;

import java.util.List;

import com.novelle.model.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Tags of a story (RB6: at most 10). {@code Tag.UsageCount} has no trigger: the service keeps it equal to
 * {@code COUNT(StoryTag)} in the same transaction (docs/module-studio.md NFR-M6-09). SQL: resources/mapper/TagMapper.xml.
 */
@Mapper
public interface TagMapper {

    /** Existing tags with one of the slugs. */
    List<Tag> findBySlugs(@Param("slugs") List<String> slugs);

    /** The tag whose slug or name matches (used after a concurrent insert hit the unique index), or null. */
    Tag findByNameOrSlug(@Param("name") String name, @Param("slug") String slug);

    /** Sets {@code tag.tagId}; UQ on Name and Slug rejects a duplicate. UsageCount starts at 0. */
    int insert(Tag tag);

    List<Integer> findStoryTagIds(@Param("storyId") int storyId);

    int insertStoryTags(@Param("storyId") int storyId, @Param("tagIds") List<Integer> tagIds);

    int deleteStoryTags(@Param("storyId") int storyId, @Param("tagIds") List<Integer> tagIds);

    /** UsageCount += delta for every tag in {@code tagIds} (one atomic UPDATE, no read-then-write). */
    int adjustUsage(@Param("tagIds") List<Integer> tagIds, @Param("delta") int delta);
}
