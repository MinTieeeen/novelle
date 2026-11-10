package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

import com.novelle.dto.CreateStoryRequest;
import com.novelle.dto.UpdateStoryRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.StoryMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.StudioStory;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DuplicateKeyException;

class StudioStoryServiceTest {

    private static final int AUTHOR = 5;
    private static final int STORY = 70;

    private StudioStoryMapper mapper;
    private StudioOwnership ownership;
    private TagService tags;
    private CacheService cache;
    private StudioStoryService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StudioStoryMapper.class);
        StoryMapper publicMapper = mock(StoryMapper.class);
        ownership = mock(StudioOwnership.class);
        tags = mock(TagService.class);
        cache = mock(CacheService.class);
        service = new StudioStoryService(mapper, publicMapper, ownership, tags, new SlugGenerator(), cache);
        when(publicMapper.findGenres(anyInt())).thenReturn(List.of());
        when(publicMapper.findTags(anyInt())).thenReturn(List.of());
        when(mapper.countGenres(anyList())).thenAnswer(inv -> inv.<List<?>>getArgument(0).size());
        when(mapper.slugsLike(anyString(), anyString())).thenReturn(List.of());
        when(ownership.story(anyInt(), eq(AUTHOR))).thenReturn(story("DRAFT", 0));
    }

    private static StudioStory story(String status, int chapterCount) {
        StudioStory s = new StudioStory();
        s.setStoryId(STORY);
        s.setAuthorId(AUTHOR);
        s.setTitle("Kiếm Đạo");
        s.setPublishStatus(status);
        s.setChapterCount(chapterCount);
        s.setUpdatedAt(LocalDateTime.of(2026, 11, 9, 3, 10));
        return s;
    }

    private static CreateStoryRequest create(String title, List<Integer> genres, Integer primary) {
        return new CreateStoryRequest(title, " Mô tả ", null, "ALL", "ONGOING", genres, primary, List.of("Hệ thống"));
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- RB6 ---------- */

    @Test
    void validGenresAreReturnedInOrder() {
        assertThat(service.validateGenres(List.of(4, 1, 7), 1)).containsExactly(4, 1, 7);
    }

    @Test
    void genreRulesAreChecked() {
        assertCode(() -> service.validateGenres(List.of(), 1), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.validateGenres(List.of(1, 2, 3, 4), 1), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.validateGenres(List.of(1, 1), 1), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.validateGenres(List.of(1, 2), 3), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.validateGenres(List.of(1, 2), null), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void unknownGenreIsRejected() {
        when(mapper.countGenres(anyList())).thenReturn(1);
        assertCode(() -> service.validateGenres(List.of(1, 999), 1), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void createWritesNothingWhenGenresAreInvalid() {
        assertCode(() -> service.create(AUTHOR, create("Truyện", List.of(1, 2), 9)), ErrorCode.VALIDATION_FAILED);
        verify(mapper, never()).insert(any());
        verify(mapper, never()).insertGenres(anyInt(), anyList(), anyInt());
    }

    /* ---------- slug ---------- */

    @Test
    void freeSlugUsesTheBaseWhenFree() {
        assertThat(service.freeSlug("Kiếm Đạo Độc Tôn")).isEqualTo("kiem-dao-doc-ton");
    }

    @Test
    void freeSlugAddsTheFirstFreeSuffix() {
        when(mapper.slugsLike("kiem-dao", "kiem-dao-%")).thenReturn(List.of("kiem-dao", "kiem-dao-2", "kiem-dao-4"));
        assertThat(service.freeSlug("Kiếm Đạo")).isEqualTo("kiem-dao-3");
    }

    @Test
    void titleWithoutLetterGetsTheFallbackSlug() {
        assertThat(service.freeSlug("!!!")).isEqualTo(StudioStoryService.SLUG_FALLBACK);
    }

    @Test
    void slugTakenConcurrentlyIsChosenAgainOnce() {
        when(mapper.slugsLike("truyen-moi", "truyen-moi-%")).thenReturn(List.of(), List.of("truyen-moi"));
        when(mapper.insert(any())).thenThrow(new DuplicateKeyException("Violation of UNIQUE KEY constraint 'UQ_Story_Slug'"))
                .thenAnswer(inv -> {
                    inv.<StudioStory>getArgument(0).setStoryId(STORY);
                    return 1;
                });

        service.create(AUTHOR, create("Truyện mới", List.of(1), 1));

        verify(mapper, times(2)).insert(any());
        verify(mapper).insertGenres(STORY, List.of(1), 1);
        verify(tags).replaceStoryTags(eq(STORY), anyList());
    }

    @Test
    void otherDuplicateKeyIsNotRetried() {
        when(mapper.insert(any())).thenThrow(new DuplicateKeyException("PK_Story"));
        assertThatThrownBy(() -> service.create(AUTHOR, create("Truyện", List.of(1), 1)))
                .isInstanceOf(DuplicateKeyException.class);
        verify(mapper, times(1)).insert(any());
    }

    @Test
    void createTrimsAndClearsBlankFields() {
        doAnswer(inv -> {
            StudioStory s = inv.getArgument(0);
            assertThat(s.getTitle()).isEqualTo("Truyện");
            assertThat(s.getDescription()).isEqualTo("Mô tả");
            assertThat(s.getCoverUrl()).isNull();
            s.setStoryId(STORY);
            return 1;
        }).when(mapper).insert(any());

        service.create(AUTHOR, create("  Truyện ", List.of(1), 1));
    }

    /* ---------- update ---------- */

    @Test
    void staleVersionIs409AndEvictsNothing() {
        when(mapper.updateMeta(anyInt(), anyInt(), any(), anyBoolean(), any(), anyBoolean(), any(), any(), any(), any()))
                .thenReturn(0);
        UpdateStoryRequest req = new UpdateStoryRequest("Mới", null, null, null, null, Instant.parse("2026-11-09T03:10:00.123Z"));

        assertCode(() -> service.update(AUTHOR, STORY, req), ErrorCode.STALE_DATA);
        verifyNoInteractions(cache);
    }

    @Test
    void updatePassesTheVersionAsUtcAndClearsEmptyFields() {
        when(mapper.updateMeta(anyInt(), anyInt(), any(), anyBoolean(), any(), anyBoolean(), any(), any(), any(), any()))
                .thenReturn(1);
        UpdateStoryRequest req = new UpdateStoryRequest(null, "", "", null, "COMPLETED",
                Instant.parse("2026-11-09T03:10:00.123Z"));

        service.update(AUTHOR, STORY, req);

        verify(mapper).updateMeta(STORY, AUTHOR, null, true, null, true, null, null, "COMPLETED",
                LocalDateTime.of(2026, 11, 9, 3, 10, 0, 123_000_000));
    }

    @Test
    void updateWithoutAnyFieldIsRejected() {
        UpdateStoryRequest req = new UpdateStoryRequest(null, null, null, null, null, Instant.now());
        assertCode(() -> service.update(AUTHOR, STORY, req), ErrorCode.VALIDATION_FAILED);
    }

    /* ---------- publish / unpublish (D1, D5) ---------- */

    @ParameterizedTest
    @CsvSource({"HIDDEN, 3, STORY_HIDDEN", "PUBLISHED, 3, ALREADY_PROCESSED", "DRAFT, 0, STORY_HAS_NO_CHAPTER"})
    void publishExplainsWhyNothingChanged(String status, int chapters, ErrorCode expected) {
        when(mapper.publish(STORY, AUTHOR)).thenReturn(0);
        when(ownership.story(STORY, AUTHOR)).thenReturn(story(status, chapters));

        assertCode(() -> service.publish(AUTHOR, STORY), expected);
        verifyNoInteractions(cache);
    }

    @Test
    void publishEvictsStoryAndHome() {
        when(mapper.publish(STORY, AUTHOR)).thenReturn(1);
        when(ownership.story(STORY, AUTHOR)).thenReturn(story("PUBLISHED", 1));

        service.publish(AUTHOR, STORY);

        verify(cache).evict("cache:story:" + STORY, "cache:home");
    }

    @ParameterizedTest
    @CsvSource({"HIDDEN, STORY_HIDDEN", "DRAFT, ALREADY_PROCESSED"})
    void unpublishExplainsWhyNothingChanged(String status, ErrorCode expected) {
        when(mapper.unpublish(STORY, AUTHOR)).thenReturn(0);
        when(ownership.story(STORY, AUTHOR)).thenReturn(story(status, 1));

        assertCode(() -> service.unpublish(AUTHOR, STORY), expected);
    }

    @Test
    void statusFilterIsCaseInsensitiveAndChecked() {
        service.page(AUTHOR, "draft", null, null);
        verify(mapper).countMine(AUTHOR, "DRAFT");
        assertCode(() -> service.page(AUTHOR, "DELETED", null, null), ErrorCode.VALIDATION_FAILED);
    }
}
