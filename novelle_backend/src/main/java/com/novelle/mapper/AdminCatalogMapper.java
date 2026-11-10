package com.novelle.mapper;

import java.util.List;

import com.novelle.model.AdminGenre;
import com.novelle.model.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Genre and tag management (F12, docs/module-admin.md G1–G4, T1–T3). SQL: resources/mapper/AdminCatalogMapper.xml. */
@Mapper
public interface AdminCatalogMapper {

    /* ---------- genres ---------- */

    List<AdminGenre> listGenres();

    AdminGenre findGenre(@Param("genreId") int genreId);

    /** True when another genre has this name or slug (UQ_Genre_Name / UQ_Genre_Slug collation). */
    boolean genreTaken(@Param("name") String name, @Param("slug") String slug,
                       @Param("exceptId") Integer exceptId);

    /** Sets {@code genre.genreId}. */
    int insertGenre(AdminGenre genre);

    /** Null fields unchanged; {@code descriptionSet} writes {@code description} (may be null). Slug never changes. */
    int updateGenre(@Param("genreId") int genreId, @Param("name") String name,
                    @Param("descriptionSet") boolean descriptionSet, @Param("description") String description,
                    @Param("sortOrder") Integer sortOrder);

    /** True when any StoryGenre row uses the genre, deleted stories included (the FK would refuse the delete). */
    boolean genreInUse(@Param("genreId") int genreId);

    int deleteGenre(@Param("genreId") int genreId);

    /* ---------- tags ---------- */

    /** Most used first; {@code likePattern} null = every tag. */
    List<Tag> pageTags(@Param("likePattern") String likePattern, @Param("offset") int offset, @Param("size") int size);

    long countTags(@Param("likePattern") String likePattern);

    Tag findTag(@Param("tagId") int tagId);

    /** True when another tag has this name or slug. */
    boolean tagTaken(@Param("name") String name, @Param("slug") String slug, @Param("exceptId") int exceptId);

    int renameTag(@Param("tagId") int tagId, @Param("name") String name, @Param("slug") String slug);

    /** Stories carrying the tag (cache eviction). */
    List<Integer> storyIdsWithTag(@Param("tagId") int tagId);

    int deleteStoryTagsOfTag(@Param("tagId") int tagId);

    int deleteTag(@Param("tagId") int tagId);
}
