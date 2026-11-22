package com.novelle.mapper;

import java.time.LocalDateTime;
import java.util.List;

import com.novelle.model.StudioStory;
import com.novelle.model.StudioStoryCard;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * Stories as their author manages them (F8). Every statement on one story filters {@code AuthorId = @me AND
 * IsDeleted = 0} (RB1, RB2). Genres and tags of a story are read with {@link StoryMapper#findGenres} /
 * {@link StoryMapper#findTags}, which do not filter on visibility. SQL: resources/mapper/StudioStoryMapper.xml.
 */
@Mapper
public interface StudioStoryMapper {

    /** My stories, newest change first; {@code status} null = every status. */
    List<StudioStoryCard> pageMine(@Param("authorId") int authorId, @Param("status") String status,
                                   @Param("offset") int offset, @Param("size") int size);

    long countMine(@Param("authorId") int authorId, @Param("status") String status);

    /** The story when it is mine and not deleted, otherwise null. */
    StudioStory findOwned(@Param("storyId") int storyId, @Param("authorId") int authorId);

    /** Slugs equal to {@code base} or starting with {@code base-}, deleted stories included (UQ_Story_Slug). */
    List<String> slugsLike(@Param("base") String base, @Param("likePattern") String likePattern);

    /** Inserts a DRAFT story and sets {@code story.storyId}; UQ_Story_Slug rejects a duplicate slug. */
    int insert(StudioStory story);

    /**
     * Optimistic update (D4): applies only while {@code UpdatedAt = version}. Null fields stay unchanged;
     * {@code descriptionSet} / {@code coverUrlSet} write their value even when null. 0 = stale or not mine.
     */
    int updateMeta(@Param("storyId") int storyId, @Param("authorId") int authorId,
                   @Param("title") String title,
                   @Param("descriptionSet") boolean descriptionSet, @Param("description") String description,
                   @Param("coverUrlSet") boolean coverUrlSet, @Param("coverUrl") String coverUrl,
                   @Param("ageRating") String ageRating, @Param("completionStatus") String completionStatus,
                   @Param("version") LocalDateTime version);

    /** UpdatedAt = now (after genres or tags changed, so open edit forms see a new version). */
    int touch(@Param("storyId") int storyId);

    /** How many of {@code genreIds} exist in dbo.Genre. */
    int countGenres(@Param("genreIds") List<Integer> genreIds);

    int deleteGenres(@Param("storyId") int storyId);

    /** One StoryGenre row per id; {@code primaryGenreId} gets IsPrimary = 1 (UX_StoryGenre_Primary). */
    int insertGenres(@Param("storyId") int storyId, @Param("genreIds") List<Integer> genreIds,
                     @Param("primaryGenreId") int primaryGenreId);

    /** DRAFT → PUBLISHED when the story has a published chapter (D1). 0 = not mine, wrong status or no chapter. */
    int publish(@Param("storyId") int storyId, @Param("authorId") int authorId);

    /** PUBLISHED → DRAFT. 0 = not mine or not PUBLISHED. */
    int unpublish(@Param("storyId") int storyId, @Param("authorId") int authorId);

    /** sp_DeleteStory: soft delete; throws 50004 (not found) / 50002 (not the owner). */
    void deleteStory(@Param("storyId") int storyId, @Param("userId") int userId);

    /** Ids of my stories that are not deleted (cache eviction after a pen name change). */
    List<Integer> storyIdsOfAuthor(@Param("authorId") int authorId);
}
