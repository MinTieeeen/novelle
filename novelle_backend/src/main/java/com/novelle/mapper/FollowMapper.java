package com.novelle.mapper;

import java.util.List;

import com.novelle.model.FollowedAuthor;
import com.novelle.model.StoryCard;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Following stories (Follow) and authors (AuthorFollow), F5. The counters Story.FollowCount and
 * Author.FollowerCount are kept by trg_Follow / trg_AuthorFollow. SQL: resources/mapper/FollowMapper.xml.
 */
@Mapper
public interface FollowMapper {

    /* ---------- stories ---------- */

    /** 1 when a row was added, 0 when already following (idempotent, docs/module-library.md D1). */
    int followStory(@Param("userId") int userId, @Param("storyId") int storyId);

    int unfollowStory(@Param("userId") int userId, @Param("storyId") int storyId);

    boolean isFollowingStory(@Param("userId") int userId, @Param("storyId") int storyId);

    /** {@code Story.FollowCount} of any story (also hidden ones), null when the story does not exist. */
    Integer storyFollowCount(@Param("storyId") int storyId);

    /** Followed public stories, newest chapter first (stories without chapters last). */
    List<StoryCard> pageFollowedStories(@Param("userId") int userId,
                                        @Param("offset") int offset, @Param("size") int size);

    long countFollowedStories(@Param("userId") int userId);

    /* ---------- authors ---------- */

    int followAuthor(@Param("followerId") int followerId, @Param("authorId") int authorId);

    int unfollowAuthor(@Param("followerId") int followerId, @Param("authorId") int authorId);

    boolean isFollowingAuthor(@Param("followerId") int followerId, @Param("authorId") int authorId);

    /** {@code Author.FollowerCount}, null when there is no such author (doubles as the existence check). */
    Integer authorFollowerCount(@Param("authorId") int authorId);

    /** Followed authors, most recently followed first. */
    List<FollowedAuthor> pageFollowedAuthors(@Param("followerId") int followerId,
                                             @Param("offset") int offset, @Param("size") int size);

    long countFollowedAuthors(@Param("followerId") int followerId);
}
