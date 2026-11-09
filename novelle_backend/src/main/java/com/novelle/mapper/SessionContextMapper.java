package com.novelle.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * SESSION_CONTEXT of the current SQL Server session (NFR-M6-06). {@code trg_Chapter_Revision} reads
 * {@code user_id} to fill ChapterRevision.EditedBy and fails with 50005 without it. Must run inside the same
 * {@code @Transactional} method as the chapter UPDATE, so both use the same pooled connection; pooled connections
 * are reused, so it is set again before every edit instead of trusting a value left by an earlier request.
 * SQL: resources/mapper/SessionContextMapper.xml.
 */
@Mapper
public interface SessionContextMapper {

    void setUserId(@Param("userId") int userId);
}
