package com.novelle.mapper;

import com.novelle.model.AuthorProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Public author pages. SQL: resources/mapper/AuthorMapper.xml. */
@Mapper
public interface AuthorMapper {

    /** Profile with statistics over public stories only, or null when there is no such author. */
    AuthorProfile findPublicProfile(@Param("authorId") int authorId);

    boolean existsAuthor(@Param("authorId") int authorId);
}
