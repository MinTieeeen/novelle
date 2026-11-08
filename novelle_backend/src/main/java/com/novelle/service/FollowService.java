package com.novelle.service;

import java.util.List;

import com.novelle.dto.AuthorFollowStatusResponse;
import com.novelle.dto.FollowStatusResponse;
import com.novelle.dto.FollowedAuthorResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.FollowMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Following stories and authors (F5). Follow / unfollow are idempotent (docs/module-library.md D1); following needs
 * a public story (D2) while unfollowing works for any existing story. The counters are kept by trg_Follow /
 * trg_AuthorFollow and read back after the write; a change of Story.FollowCount evicts {@code cache:story:{id}}.
 */
@Service
public class FollowService {

    private final FollowMapper followMapper;
    private final ReadingHistoryMapper readingHistoryMapper;
    private final CacheService cacheService;

    public FollowService(FollowMapper followMapper, ReadingHistoryMapper readingHistoryMapper,
                         CacheService cacheService) {
        this.followMapper = followMapper;
        this.readingHistoryMapper = readingHistoryMapper;
        this.cacheService = cacheService;
    }

    /* ---------- stories ---------- */

    @Transactional(readOnly = true)
    public FollowStatusResponse storyStatus(int userId, int storyId) {
        requirePublicStory(storyId);
        return storyState(storyId,followMapper.isFollowingStory(userId, storyId));
    }

    @Transactional
    public FollowStatusResponse followStory(int userId, int storyId) {
        requirePublicStory(storyId);
        int added;
        try {
            added = followMapper.followStory(userId, storyId);
        } catch (DuplicateKeyException ex) {
            added = 0;               // a concurrent PUT of the same user inserted first: already following
        }
        if (added > 0) {
            cacheService.evict(CacheKeys.story(storyId));
        }
        return storyState(storyId,true);
    }

    @Transactional
    public FollowStatusResponse unfollowStory(int userId, int storyId) {
        if (followMapper.storyFollowCount(storyId) == null) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        if (followMapper.unfollowStory(userId, storyId) > 0) {
            cacheService.evict(CacheKeys.story(storyId));
        }
        return storyState(storyId,false);
    }

    @Transactional(readOnly = true)
    public PageResponse<StoryCardResponse> followedStories(int userId, Integer page, Integer size) {
        PageQuery q = PageQuery.of(page, size);
        long total = followMapper.countFollowedStories(userId);
        List<StoryCardResponse> items = total == 0 ? List.of()
                : followMapper.pageFollowedStories(userId, q.offset(), q.size()).stream()
                        .map(StoryCardResponse::from).toList();
        return PageResponse.of(items, q.page(), q.size(), total);
    }

    /* ---------- authors ---------- */

    @Transactional(readOnly = true)
    public AuthorFollowStatusResponse authorStatus(int userId, int authorId) {
        requireAuthor(authorId);
        return authorState(authorId, followMapper.isFollowingAuthor(userId, authorId));
    }

    /** RB4: an author cannot follow themself (also CK_AuthorFollow_NotSelf). */
    @Transactional
    public AuthorFollowStatusResponse followAuthor(int userId, int authorId) {
        requireAuthor(authorId);
        if (authorId == userId) {
            throw new ApiException(ErrorCode.CANNOT_FOLLOW_SELF);
        }
        try {
            followMapper.followAuthor(userId, authorId);
        } catch (DuplicateKeyException ex) {
            // concurrent PUT inserted first: already following
        }
        return authorState(authorId, true);
    }

    @Transactional
    public AuthorFollowStatusResponse unfollowAuthor(int userId, int authorId) {
        requireAuthor(authorId);
        followMapper.unfollowAuthor(userId, authorId);
        return authorState(authorId, false);
    }

    @Transactional(readOnly = true)
    public PageResponse<FollowedAuthorResponse> followedAuthors(int userId, Integer page, Integer size) {
        PageQuery q = PageQuery.of(page, size);
        long total = followMapper.countFollowedAuthors(userId);
        List<FollowedAuthorResponse> items = total == 0 ? List.of()
                : followMapper.pageFollowedAuthors(userId, q.offset(), q.size()).stream()
                        .map(FollowedAuthorResponse::from).toList();
        return PageResponse.of(items, q.page(), q.size(), total);
    }

    /* ---------- helpers ---------- */

    private void requirePublicStory(int storyId) {
        if (!readingHistoryMapper.existsPublicStory(storyId)) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
    }

    private void requireAuthor(int authorId) {
        if (followMapper.authorFollowerCount(authorId) == null) {
            throw new ApiException(ErrorCode.AUTHOR_NOT_FOUND);
        }
    }

    private FollowStatusResponse storyState(int storyId, boolean following) {
        Integer count = followMapper.storyFollowCount(storyId);
        return new FollowStatusResponse(storyId, following, count == null ? 0 : count);
    }

    private AuthorFollowStatusResponse authorState(int authorId, boolean following) {
        Integer count = followMapper.authorFollowerCount(authorId);
        return new AuthorFollowStatusResponse(authorId, following, count == null ? 0 : count);
    }
}
