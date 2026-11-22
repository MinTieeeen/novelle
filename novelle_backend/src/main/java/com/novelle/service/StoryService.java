package com.novelle.service;

import com.novelle.dto.StoryDetailResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.mapper.StoryMapper;
import com.novelle.model.StoryDetail;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Public story detail page (F3). */
@Service
public class StoryService {

    private final StoryMapper storyMapper;
    private final CacheService cache;
    private final CacheTtlProperties ttl;

    public StoryService(StoryMapper storyMapper, CacheService cache, CacheTtlProperties ttl) {
        this.storyMapper = storyMapper;
        this.cache = cache;
        this.ttl = ttl;
    }

    /**
     * The slug is resolved against vw_PublicStory on every request (decision D5) before the cache is read, so a
     * story that was just hidden or deleted is a 404 at once even if its {@code cache:story:{id}} entry remains.
     */
    @Transactional(readOnly = true)
    public StoryDetailResponse getDetail(String slug) {
        Integer storyId = storyMapper.findPublicIdBySlug(slug);
        if (storyId == null) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        StoryDetailResponse detail = cache.getOrLoad(CacheKeys.story(storyId), ttl.story(),
                StoryDetailResponse.class, () -> load(storyId));
        if (detail == null) {
            // hidden between the two reads
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
        return detail;
    }

    private StoryDetailResponse load(int storyId) {
        StoryDetail story = storyMapper.findDetail(storyId);
        if (story == null) {
            return null;
        }
        return StoryDetailResponse.from(story,
                storyMapper.findGenres(storyId),
                storyMapper.findTags(storyId),
                storyMapper.findVolumesWithChapters(storyId),
                storyMapper.findLooseChapters(storyId));
    }
}
