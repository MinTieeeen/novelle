package com.novelle.mapper;

import com.novelle.infrastructure.mybatis.RowVersion;
import com.novelle.model.AppUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Own profile and public profiles. SQL: resources/mapper/UserMapper.xml. */
@Mapper
public interface UserMapper {

    AppUser findMe(@Param("userId") int userId);

    /** ACTIVE users only: a banned account has no public page. */
    AppUser findPublicByUsername(@Param("username") String username);

    /**
     * Optimistic update: returns 0 when RowVer no longer matches.
     * {@code displayName} null = unchanged; {@code bioSet} false = Bio unchanged, true = set to {@code bio} (may be null).
     */
    int updateProfile(@Param("userId") int userId,
                      @Param("displayName") String displayName,
                      @Param("bioSet") boolean bioSet,
                      @Param("bio") String bio,
                      @Param("rowVersion") RowVersion rowVersion);

    String findPasswordHash(@Param("userId") int userId);

    int updatePasswordHash(@Param("userId") int userId, @Param("passwordHash") String passwordHash);
}
