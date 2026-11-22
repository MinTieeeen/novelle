package com.novelle.service;

import java.util.List;
import java.util.Set;

import com.novelle.dto.AdminStoryItemResponse;
import com.novelle.dto.PageResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.AdminStoryMapper;
import com.novelle.mapper.RatingMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.AdminStory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Content moderation (F12, docs/module-admin.md C1–C5, RB8). Hide / unhide carry their precondition in the
 * UPDATE (D3, D7); a 0-row result is read again to pick the error code. Every change evicts the public caches,
 * so the story disappears from F1–F3 at once (NFR-M7-06).
 */
@Service
public class ModerationService {

    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "HIDDEN");

    private final AdminStoryMapper storyMapper;
    private final StudioStoryMapper studioStoryMapper;
    private final RatingMapper ratingMapper;
    private final CacheService cache;

    public ModerationService(AdminStoryMapper storyMapper, StudioStoryMapper studioStoryMapper,
                             RatingMapper ratingMapper, CacheService cache) {
        this.storyMapper = storyMapper;
        this.studioStoryMapper = studioStoryMapper;
        this.ratingMapper = ratingMapper;
        this.cache = cache;
    }

    /** C1. */
    @Transactional(readOnly = true)
    public PageResponse<AdminStoryItemResponse> page(String publishStatus, String q, Integer authorId,
                                                     Integer page, Integer size) {
        PageQuery pq = PageQuery.of(page, size);
        String status = AdminUserService.parseEnum("publishStatus", publishStatus, STATUSES);
        String like = AdminUserService.likePattern(q);
        long total = storyMapper.countStories(status, like, authorId);
        List<AdminStoryItemResponse> items = total == 0 ? List.of()
                : storyMapper.pageStories(status, like, authorId, pq.offset(), pq.size()).stream()
                        .map(AdminStoryItemResponse::from).toList();
        return PageResponse.of(items, pq.page(), pq.size(), total);
    }

    /** C2: only a PUBLISHED story can be hidden (D3). */
    @Transactional
    public AdminStoryItemResponse hide(int storyId, String reason) {
        if (storyMapper.hide(storyId, reason.strip()) == 0) {
            AdminStory now = require(storyId);
            throw "HIDDEN".equals(now.getPublishStatus())
                    ? new ApiException(ErrorCode.ALREADY_PROCESSED, "The story is already hidden.")
                    : new ApiException(ErrorCode.CONFLICT, "Only a published story can be hidden.");
        }
        evict(storyId);
        return AdminStoryItemResponse.from(require(storyId));
    }

    /** C3. */
    @Transactional
    public AdminStoryItemResponse unhide(int storyId) {
        if (storyMapper.unhide(storyId) == 0) {
            require(storyId);
            throw new ApiException(ErrorCode.ALREADY_PROCESSED, "The story is not hidden.");
        }
        evict(storyId);
        return AdminStoryItemResponse.from(require(storyId));
    }

    /**
     * C4. Not {@code @Transactional}: sp_DeleteStory opens and ends its own transaction; its ADMIN branch allows
     * any story. The read first gives the 404.
     */
    public void delete(int adminId, int storyId) {
        require(storyId);
        studioStoryMapper.deleteStory(storyId, adminId);
        evict(storyId);
    }

    /** C5: trg_Rating recomputes RatingAvg / RatingCount. */
    @Transactional
    public void deleteRating(int storyId, int userId) {
        if (ratingMapper.delete(userId, storyId) == 0) {
            throw new ApiException(ErrorCode.NOT_FOUND, "Rating not found.");
        }
        cache.evict(CacheKeys.story(storyId));
    }

    private AdminStory require(int storyId) {
        AdminStory story = storyMapper.findStory(storyId);
        if (story == null) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        return story;
    }

    private void evict(int storyId) {
        cache.evict(CacheKeys.story(storyId), CacheKeys.HOME);
    }
}
