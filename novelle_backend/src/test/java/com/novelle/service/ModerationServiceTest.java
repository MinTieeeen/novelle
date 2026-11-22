package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.AdminStoryMapper;
import com.novelle.mapper.RatingMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.AdminStory;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ModerationServiceTest {

    private static final int STORY = 7;

    private AdminStoryMapper mapper;
    private StudioStoryMapper studioMapper;
    private RatingMapper ratingMapper;
    private CacheService cache;
    private ModerationService service;

    @BeforeEach
    void setUp() {
        mapper = mock(AdminStoryMapper.class);
        studioMapper = mock(StudioStoryMapper.class);
        ratingMapper = mock(RatingMapper.class);
        cache = mock(CacheService.class);
        service = new ModerationService(mapper, studioMapper, ratingMapper, cache);
    }

    private void storyIs(String status) {
        AdminStory s = new AdminStory();
        s.setStoryId(STORY);
        s.setPublishStatus(status);
        when(mapper.findStory(STORY)).thenReturn(s);
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    @Test
    void hideEvictsTheStoryAndHome() {
        when(mapper.hide(STORY, "Bản quyền")).thenReturn(1);
        storyIs("HIDDEN");

        service.hide(STORY, " Bản quyền ");

        verify(cache).evict("cache:story:7", "cache:home");
    }

    @Test
    void hideExplainsWhyNothingChanged() {
        when(mapper.hide(anyInt(), anyString())).thenReturn(0);
        storyIs("HIDDEN");
        assertCode(() -> service.hide(STORY, "x"), ErrorCode.ALREADY_PROCESSED);
        storyIs("DRAFT");
        assertCode(() -> service.hide(STORY, "x"), ErrorCode.CONFLICT);
        when(mapper.findStory(STORY)).thenReturn(null);
        assertCode(() -> service.hide(STORY, "x"), ErrorCode.STORY_NOT_FOUND);
        verifyNoInteractions(cache);
    }

    @Test
    void unhideOfAStoryThatIsNotHiddenIs409() {
        when(mapper.unhide(STORY)).thenReturn(0);
        storyIs("PUBLISHED");
        assertCode(() -> service.unhide(STORY), ErrorCode.ALREADY_PROCESSED);
    }

    @Test
    void deleteChecksExistenceBeforeTheProcedure() {
        when(mapper.findStory(STORY)).thenReturn(null);
        assertCode(() -> service.delete(1, STORY), ErrorCode.STORY_NOT_FOUND);
        verify(studioMapper, never()).deleteStory(anyInt(), anyInt());

        storyIs("DRAFT");
        service.delete(1, STORY);
        verify(studioMapper).deleteStory(STORY, 1);
        verify(cache).evict("cache:story:7", "cache:home");
    }

    @Test
    void deletingAMissingRatingIs404() {
        when(ratingMapper.delete(5, STORY)).thenReturn(0);
        assertCode(() -> service.deleteRating(STORY, 5), ErrorCode.NOT_FOUND);
        verifyNoInteractions(cache);

        when(ratingMapper.delete(5, STORY)).thenReturn(1);
        service.deleteRating(STORY, 5);
        verify(cache).evict("cache:story:7");
    }
}
