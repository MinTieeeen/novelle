package com.novelle.service;

import java.math.BigDecimal;

import com.novelle.dto.ChapterContentCache;
import com.novelle.dto.ChapterReadResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.infrastructure.views.ViewCounterService;
import com.novelle.mapper.ChapterMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.model.ChapterContent;
import com.novelle.model.ChapterNav;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reading a published chapter (F4, docs/module-reading.md section 8.1). */
@Service
public class ChapterReadService {

    private final ChapterMapper chapterMapper;
    private final ReadingHistoryMapper readingHistoryMapper;
    private final CacheService cache;
    private final CacheTtlProperties ttl;
    private final ViewCounterService viewCounter;

    public ChapterReadService(ChapterMapper chapterMapper, ReadingHistoryMapper readingHistoryMapper,
            CacheService cache, CacheTtlProperties ttl, ViewCounterService viewCounter) {
        this.chapterMapper = chapterMapper;
        this.readingHistoryMapper = readingHistoryMapper;
        this.cache = cache;
        this.ttl = ttl;
        this.viewCounter = viewCounter;
    }

    /**
     * <ol>
     *   <li>visibility + navigation from SQL on every request (D3): not public → 404, nothing counted;</li>
     *   <li>title / content from {@code cache:chapter:{id}} (loaded on a miss);</li>
     *   <li>logged in: reading position moved to this chapter, scroll kept when it is the same chapter (D2);</li>
     *   <li>one view counted on Redis (D1, D4), after the reads succeeded.</li>
     * </ol>
     * The view is counted inside the transaction, not after commit: a failed commit could count a view that
     * should not be counted, which is accepted (and an after-commit hook would never run in rolled-back tests).
     *
     * @param userId        logged-in user, or null for a guest
     * @param remoteAddress client socket address (viewer id of a guest)
     */
    @Transactional
    public ChapterReadResponse read(long chapterId, Integer userId, String remoteAddress) {
        ChapterNav nav = chapterMapper.findPublicNav(chapterId);
        if (nav == null) {
            throw new ApiException(ErrorCode.CHAPTER_NOT_FOUND);
        }
        ChapterContentCache content = cache.getOrLoad(CacheKeys.chapter(chapterId), ttl.chapter(),
                ChapterContentCache.class, () -> loadContent(chapterId));
        if (content == null) {
            // deleted between the two reads
            throw new ApiException(ErrorCode.CHAPTER_NOT_FOUND);
        }

        BigDecimal myScroll = null;
        if (userId != null) {
            myScroll = readingHistoryMapper.touch(userId, nav.getStoryId(), chapterId);
        }
        viewCounter.record(nav.getStoryId(), chapterId, userId, remoteAddress);
        return ChapterReadResponse.from(nav, content, myScroll);
    }

    private ChapterContentCache loadContent(long chapterId) {
        ChapterContent c = chapterMapper.findContent(chapterId);
        return c == null ? null : ChapterContentCache.from(c);
    }
}
