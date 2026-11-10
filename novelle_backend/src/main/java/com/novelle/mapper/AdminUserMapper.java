package com.novelle.mapper;

import java.util.List;

import com.novelle.model.AdminUser;
import com.novelle.model.AdminUserCriteria;
import com.novelle.model.NewUser;
import com.novelle.model.StatusCount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** User management of the administrators (F11, docs/module-admin.md U1–U6). SQL: resources/mapper/AdminUserMapper.xml. */
@Mapper
public interface AdminUserMapper {

    /** Newest accounts first. */
    List<AdminUser> pageUsers(@Param("c") AdminUserCriteria criteria,
                              @Param("offset") int offset, @Param("size") int size);

    long countUsers(@Param("c") AdminUserCriteria criteria);

    /** The account with who banned it and, for an AUTHOR, the author profile; null when unknown. */
    AdminUser findUser(@Param("userId") int userId);

    /** Author requests of the user per status (only statuses that occur). */
    List<StatusCount> countRequestsByStatus(@Param("userId") int userId);

    /** ACTIVE → BANNED unless the user is an ADMIN (D1, D7). 0 = unknown, ADMIN or already banned. */
    int ban(@Param("userId") int userId, @Param("adminId") int adminId, @Param("reason") String reason);

    /** BANNED → ACTIVE, clearing the three ban columns. 0 = unknown or not banned. */
    int unban(@Param("userId") int userId);

    /** Inserts an ACTIVE ADMIN that never logged in (G2, D8); sets {@code user.userId}. */
    int insertAdmin(NewUser user);

    /** Author.IsVerified, or null when the user is not an author. */
    Boolean findVerified(@Param("authorId") int authorId);

    int setVerified(@Param("authorId") int authorId, @Param("isVerified") boolean isVerified);
}
