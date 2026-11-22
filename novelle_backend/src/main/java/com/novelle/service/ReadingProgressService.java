package com.novelle.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;

import com.novelle.dto.ReadingProgressRequest;
import com.novelle.dto.ReadingProgressResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.ChapterMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.model.ReadingProgress;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reading position of the current user per story (RB5, docs/module-reading.md section 8.2). */
@Service
public class ReadingProgressService {

    private static final BigDecimal MAX = BigDecimal.valueOf(100);

    private final ReadingHistoryMapper readingHistoryMapper;
    private final ChapterMapper chapterMapper;

    public ReadingProgressService(ReadingHistoryMapper readingHistoryMapper, ChapterMapper chapterMapper) {
        this.readingHistoryMapper = readingHistoryMapper;
        this.chapterMapper = chapterMapper;
    }

    /**
     * Checks in this order, writing nothing on error: body → public story (404 STORY_NOT_FOUND) → public chapter
     * (404 CHAPTER_NOT_FOUND) → chapter of this story (400 CHAPTER_NOT_IN_STORY, RB5).
     */
    @Transactional
    public ReadingProgressResponse save(int userId, int storyId, ReadingProgressRequest request) {
        long chapterId = requireChapterId(request.chapterId());
        BigDecimal scroll = normalizeScroll(request.scrollPercent());

        requirePublicStory(storyId);
        Integer chapterStory = chapterMapper.findPublicChapterStory(chapterId);
        if (chapterStory == null) {
            throw new ApiException(ErrorCode.CHAPTER_NOT_FOUND);
        }
        if (chapterStory != storyId) {
            throw new ApiException(ErrorCode.CHAPTER_NOT_IN_STORY);
        }

        readingHistoryMapper.upsertProgress(userId, storyId, chapterId, scroll);
        ReadingProgress saved = readingHistoryMapper.findProgress(userId, storyId);
        if (saved == null) {
            // the chapter stopped being public between the check and the read
            throw new ApiException(ErrorCode.CHAPTER_NOT_FOUND);
        }
        return ReadingProgressResponse.from(saved);
    }

    /** Empty when there is no position, or its chapter is no longer public (the controller answers 204). */
    @Transactional(readOnly = true)
    public Optional<ReadingProgressResponse> get(int userId, int storyId) {
        requirePublicStory(storyId);
        return Optional.ofNullable(readingHistoryMapper.findProgress(userId, storyId))
                .map(ReadingProgressResponse::from);
    }

    /** 0–100, rounded half up to the 2 decimals of {@code DECIMAL(5,2)}. */
    static BigDecimal normalizeScroll(BigDecimal value) {
        if (value == null) {
            throw ApiException.invalidField("scrollPercent", "must not be null");
        }
        if (value.signum() < 0 || value.compareTo(MAX) > 0) {
            throw ApiException.invalidField("scrollPercent", "must be between 0 and 100");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static long requireChapterId(Long chapterId) {
        if (chapterId == null) {
            throw ApiException.invalidField("chapterId", "must not be null");
        }
        if (chapterId <= 0) {
            throw ApiException.invalidField("chapterId", "must be greater than 0");
        }
        return chapterId;
    }

    private void requirePublicStory(int storyId) {
        if (!readingHistoryMapper.existsPublicStory(storyId)) {
            throw new ApiException(ErrorCode.STORY_NOT_FOUND);
        }
    }
}
