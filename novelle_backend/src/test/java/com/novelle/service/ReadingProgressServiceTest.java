package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import com.novelle.dto.ReadingProgressRequest;
import com.novelle.dto.ReadingProgressResponse;
import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.ChapterMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.model.ReadingProgress;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ReadingProgressServiceTest {

    private ReadingHistoryMapper historyMapper;
    private ChapterMapper chapterMapper;
    private ReadingProgressService service;

    @BeforeEach
    void setUp() {
        historyMapper = mock(ReadingHistoryMapper.class);
        chapterMapper = mock(ChapterMapper.class);
        service = new ReadingProgressService(historyMapper, chapterMapper);
    }

    private static ReadingProgressRequest body(Long chapterId, String scroll) {
        return new ReadingProgressRequest(chapterId, scroll == null ? null : new BigDecimal(scroll));
    }

    private static ReadingProgress stored(String scroll) {
        ReadingProgress p = new ReadingProgress();
        p.setStoryId(1);
        p.setChapterId(26);
        p.setChapterNo(26);
        p.setChapterTitle("Chương 26");
        p.setScrollPercent(new BigDecimal(scroll));
        p.setUpdatedAt(LocalDateTime.of(2026, 11, 8, 9, 15, 2));
        return p;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    @SuppressWarnings("unchecked")
    private static void assertField(ThrowingCallable call, String field) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> {
            assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
            assertThat((List<ApiError.FieldError>) ex.details()).extracting(ApiError.FieldError::field).containsExactly(field);
        });
    }

    @ParameterizedTest
    @CsvSource({"0, 0.00", "100, 100.00", "81.4372, 81.44", "55.555, 55.56", "55.554, 55.55", "99.995, 100.00"})
    void scrollIsRoundedHalfUpToTwoDecimals(String in, String out) {
        assertThat(ReadingProgressService.normalizeScroll(new BigDecimal(in))).isEqualTo(new BigDecimal(out));
    }

    @Test
    void invalidBodyIsRejectedBeforeAnyQuery() {
        assertField(() -> service.save(17, 1, body(26L, "-0.01")), "scrollPercent");
        assertField(() -> service.save(17, 1, body(26L, "100.001")), "scrollPercent");
        assertField(() -> service.save(17, 1, body(26L, null)), "scrollPercent");
        assertField(() -> service.save(17, 1, body(null, "10")), "chapterId");
        assertField(() -> service.save(17, 1, body(0L, "10")), "chapterId");
        verifyNoInteractions(historyMapper, chapterMapper);
    }

    @Test
    void storyIsCheckedFirst() {
        assertCode(() -> service.save(17, 1, body(26L, "10")), ErrorCode.STORY_NOT_FOUND);
        verifyNoInteractions(chapterMapper);
    }

    @Test
    void chapterMustBePublic() {
        when(historyMapper.existsPublicStory(1)).thenReturn(true);
        // the real mapper returns null for no row; a Mockito mock would return 0 for Integer
        when(chapterMapper.findPublicChapterStory(26)).thenReturn(null);

        assertCode(() -> service.save(17, 1, body(26L, "10")), ErrorCode.CHAPTER_NOT_FOUND);
        verify(historyMapper, never()).upsertProgress(anyInt(), anyInt(), anyLong(), any());
    }

    @Test
    void chapterMustBelongToTheStory() {
        when(historyMapper.existsPublicStory(1)).thenReturn(true);
        when(chapterMapper.findPublicChapterStory(26)).thenReturn(2);

        assertCode(() -> service.save(17, 1, body(26L, "10")), ErrorCode.CHAPTER_NOT_IN_STORY);
        verify(historyMapper, never()).upsertProgress(anyInt(), anyInt(), anyLong(), any());
    }

    @Test
    void savesTheRoundedValueAndReturnsTheStoredRow() {
        when(historyMapper.existsPublicStory(1)).thenReturn(true);
        when(chapterMapper.findPublicChapterStory(26)).thenReturn(1);
        when(historyMapper.findProgress(17, 1)).thenReturn(stored("81.44"));

        ReadingProgressResponse r = service.save(17, 1, body(26L, "81.4372"));

        verify(historyMapper).upsertProgress(17, 1, 26, new BigDecimal("81.44"));
        assertThat(r.chapterId()).isEqualTo(26);
        assertThat(r.scrollPercent()).isEqualByComparingTo("81.44");
        assertThat(r.updatedAt()).hasToString("2026-11-08T09:15:02Z");
    }

    @Test
    void getChecksTheStoryAndIsEmptyWithoutPosition() {
        assertCode(() -> service.get(17, 1), ErrorCode.STORY_NOT_FOUND);

        when(historyMapper.existsPublicStory(1)).thenReturn(true);
        assertThat(service.get(17, 1)).isEmpty();

        when(historyMapper.findProgress(17, 1)).thenReturn(stored("12.00"));
        assertThat(service.get(17, 1)).get().extracting(ReadingProgressResponse::chapterNo).isEqualTo(26);
    }
}
