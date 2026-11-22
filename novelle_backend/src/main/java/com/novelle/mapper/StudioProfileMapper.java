package com.novelle.mapper;

import com.novelle.model.StudioAuthorProfile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** My author profile (dbo.Author) in the studio. SQL: resources/mapper/StudioProfileMapper.xml. */
@Mapper
public interface StudioProfileMapper {

    StudioAuthorProfile findProfile(@Param("authorId") int authorId);

    /** True when another author already uses the pen name (column collation: case and accent insensitive). */
    boolean penNameTakenByOther(@Param("penName") String penName, @Param("authorId") int authorId);

    /** {@code penName} null = unchanged; {@code bioSet} writes {@code bio} (may be null). At least one must change. */
    int updateProfile(@Param("authorId") int authorId, @Param("penName") String penName,
                      @Param("bioSet") boolean bioSet, @Param("bio") String bio);
}
