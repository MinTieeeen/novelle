package com.novelle.mapper;

import com.novelle.model.ChapterContent;
import com.novelle.model.ChapterNav;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Reading side of chapters (F4). SQL: resources/mapper/ChapterMapper.xml. */
@Mapper
public interface ChapterMapper {

    /**
     * Visibility check + navigation, run on every read: null unless the chapter is PUBLISHED, not deleted and
     * its story is public (RB3).
     */
    ChapterNav findPublicNav(@Param("chapterId") long chapterId);

    /** Title, content, word count, publish time; call only after {@link #findPublicNav} found the chapter. */
    ChapterContent findContent(@Param("chapterId") long chapterId);

    /** StoryId of a public chapter of a public story, or null (RB5 check of PUT reading-progress). */
    Integer findPublicChapterStory(@Param("chapterId") long chapterId);
}
