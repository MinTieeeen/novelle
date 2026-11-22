package com.novelle.mapper;

import java.util.List;

import com.novelle.model.Genre;
import com.novelle.model.StoryCard;
import com.novelle.model.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Genres, tag suggestions and home page blocks. SQL: resources/mapper/CatalogMapper.xml. */
@Mapper
public interface CatalogMapper {

    /** Every genre in SortOrder, with the number of public stories (aggregate over vw_PublicStory). */
    List<Genre> findGenresWithCount();

    /**
     * Most used tags. Both prefixes are LIKE patterns already escaped by the caller (escape char {@code \});
     * null = no filter.
     */
    List<Tag> findTags(@Param("namePrefix") String namePrefix,
                       @Param("slugPrefix") String slugPrefix,
                       @Param("limit") int limit);

    /**
     * One home block of public stories.
     *
     * @param orderBy       from StorySort (never request text)
     * @param completedOnly only {@code CompletionStatus = 'COMPLETED'}
     * @param minRatings    minimum RatingCount, or null
     */
    List<StoryCard> findHomeBlock(@Param("orderBy") String orderBy,
                                  @Param("completedOnly") boolean completedOnly,
                                  @Param("minRatings") Integer minRatings,
                                  @Param("limit") int limit);
}
