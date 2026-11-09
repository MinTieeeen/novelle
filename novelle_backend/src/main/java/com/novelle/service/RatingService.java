package com.novelle.service;

import java.util.List;
import java.util.Optional;

import com.novelle.dto.PageResponse;
import com.novelle.dto.RatingRequest;
import com.novelle.dto.RatingResponse;
import com.novelle.dto.RatingSaveResponse;
import com.novelle.dto.StoryRatingsResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.mapper.RatingMapper;
import com.novelle.model.RatingStats;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ratings and reviews (F6). RB16: an ADMIN never rates; RB4: an author does not rate their own story. The role is the
 * one of the session, refreshed on every request by UserStatusFilter. Story.RatingAvg / RatingCount are recomputed
 * by trg_Rating; every write that changes them evicts {@code cache:story:{id}}.
 */
@Service
public class RatingService {

    static final String ROLE_ADMIN = "ADMIN";

    private final RatingMapper ratingMapper;
    private final CacheService cacheService;

    public RatingService(RatingMapper ratingMapper, CacheService cacheService) {
        this.ratingMapper = ratingMapper;
        this.cacheService = cacheService;
    }

    /** Public: distribution over every rating, then one page of ratings (only those with text when hasReview). */
    @Transactional(readOnly = true)
    public StoryRatingsResponse list(int storyId, Integer page, Integer size, boolean hasReview) {
        PageQuery q = PageQuery.of(page, size);
        requirePublicStory(storyId);
        RatingStats stats = ratingMapper.storyRatingStats(storyId);
        long total = ratingMapper.countByStory(storyId, hasReview);
        List<RatingResponse> items = total == 0 ? List.of()
                : ratingMapper.pageByStory(storyId, hasReview, q.offset(), q.size()).stream()
                        .map(RatingResponse::from).toList();
        return new StoryRatingsResponse(storyId, stats.getRatingAvg(), stats.getRatingCount(),
                StoryRatingsResponse.distribution(ratingMapper.distribution(storyId)),
                PageResponse.of(items, q.page(), q.size(), total));
    }

    /** Empty when I have not rated the story (the controller answers 204). */
    @Transactional(readOnly = true)
    public Optional<RatingResponse> mine(int userId, int storyId) {
        requirePublicStory(storyId);
        return Optional.ofNullable(ratingMapper.findMine(userId, storyId)).map(RatingResponse::from);
    }

    /** Order of checks: ADMIN (403) → public story (404) → own story (403) → MERGE. */
    @Transactional
    public RatingSaveResponse save(SessionUser user, int storyId, RatingRequest req) {
        requireNotAdmin(user);
        Integer authorId = requirePublicStory(storyId);
        if (authorId == user.userId()) {
            throw new ApiException(ErrorCode.CANNOT_RATE_OWN_STORY);
        }
        String review = req.review() == null || req.review().isBlank() ? null : req.review().trim();
        ratingMapper.upsert(user.userId(), storyId, req.score(), review);
        cacheService.evict(CacheKeys.story(storyId));

        RatingStats stats = ratingMapper.storyRatingStats(storyId);
        return new RatingSaveResponse(RatingResponse.from(ratingMapper.findMine(user.userId(), storyId)),
                stats.getRatingAvg(), stats.getRatingCount());
    }

    /** Idempotent, also for a story that is no longer public (docs/module-library.md D1, D2). */
    @Transactional
    public void delete(SessionUser user, int storyId) {
        requireNotAdmin(user);
        if (ratingMapper.delete(user.userId(), storyId) > 0) {
            cacheService.evict(CacheKeys.story(storyId));
        }
    }

    private static void requireNotAdmin(SessionUser user) {
        if (ROLE_ADMIN.equals(user.role())) {
            throw new ApiException(ErrorCode.ADMIN_CANNOT_RATE);
        }
    }

    /** Returns the story's AuthorId. */
    private Integer requirePublicStory(int storyId) {
        Integer authorId = ratingMapper.publicStoryAuthorId(storyId);
        if (authorId == null) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        return authorId;
    }
}
