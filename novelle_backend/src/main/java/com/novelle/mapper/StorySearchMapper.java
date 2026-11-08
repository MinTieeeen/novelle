package com.novelle.mapper;

import java.util.List;

import com.novelle.model.StoryCard;
import com.novelle.model.StorySearchCriteria;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Multi-condition story search over vw_PublicStory (full-text, genres, tags, status, age, chapters, rating,
 * author). SQL: resources/mapper/StorySearchMapper.xml, which also holds the story card columns and result map
 * reused by CatalogMapper.
 */
@Mapper
public interface StorySearchMapper {

    long count(@Param("c") StorySearchCriteria criteria);

    List<StoryCard> search(@Param("c") StorySearchCriteria criteria);
}
