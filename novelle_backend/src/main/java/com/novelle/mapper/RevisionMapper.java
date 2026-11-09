package com.novelle.mapper;

import java.util.List;

import com.novelle.model.ChapterRevision;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Read side of dbo.ChapterRevision (RB10). Rows are only written by trg_Chapter_Revision, which keeps the 10
 * newest per chapter. The caller checks that the chapter is mine first. SQL: resources/mapper/RevisionMapper.xml.
 */
@Mapper
public interface RevisionMapper {

    /** Revisions of the chapter, newest first, without Content. */
    List<ChapterRevision> findRevisions(@Param("chapterId") long chapterId);

    /** One revision with its Content, or null. */
    ChapterRevision findRevision(@Param("chapterId") long chapterId, @Param("revisionNo") int revisionNo);
}
