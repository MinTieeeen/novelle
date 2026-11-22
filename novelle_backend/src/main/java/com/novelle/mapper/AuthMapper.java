package com.novelle.mapper;

import com.novelle.model.NewUser;
import com.novelle.model.UserCredential;
import com.novelle.model.UserState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** Registration, login and the per-request status check. SQL: resources/mapper/AuthMapper.xml. */
@Mapper
public interface AuthMapper {

    /** By email when {@code login} contains '@', otherwise by username. */
    UserCredential findCredential(@Param("login") String login);

    boolean existsUsername(@Param("username") String username);

    boolean existsEmail(@Param("email") String email);

    /** Inserts a READER / ACTIVE user (column defaults) and sets {@code user.userId}. */
    int insertUser(NewUser user);

    int updateLastLogin(@Param("userId") int userId);

    UserState findState(@Param("userId") int userId);
}
