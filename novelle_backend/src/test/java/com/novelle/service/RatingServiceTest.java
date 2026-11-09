package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;

import com.novelle.dto.RatingRequest;
import com.novelle.dto.StoryRatingsResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.mapper.RatingMapper;
import com.novelle.model.Rating;
import com.novelle.model.RatingStats;
import com.novelle.model.ScoreCount;
import com.novelle.model.UserRef;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RatingServiceTest {

    private static final int STORY = 1;
    private static final int AUTHOR = 4;
    private static final SessionUser READER = new SessionUser(120, "reader_120", "READER");

    private RatingMapper mapper;
    private CacheService cache;
    private RatingService service;

    @BeforeEach
    void setUp() {
        mapper = mock(RatingMapper.class);
        cache = mock(CacheService.class);
        service = new RatingService(mapper, cache);
        when(mapper.publicStoryAuthorId(STORY)).thenReturn(AUTHOR);
        RatingStats stats = new RatingStats();
        stats.setRatingAvg(new BigDecimal("4.31"));
        stats.setRatingCount(173);
        when(mapper.storyRatingStats(STORY)).thenReturn(stats);
        when(mapper.findMine(READER.userId(), STORY)).thenReturn(rating(4));
    }

    private static Rating rating(int score) {
        Rating r = new Rating();
        r.setStoryId(STORY);
        r.setScore(score);
        UserRef u = new UserRef();
        u.setUserId(120);
        u.setUsername("reader_120");
        r.setUser(u);
        return r;
    }

    private static ScoreCount score(int score, int total) {
        ScoreCount c = new ScoreCount();
        c.setScore(score);
        c.setTotal(total);
        return c;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    @Test
    void saveMergesEvictsAndReturnsTheNewAverage() {
        var res = service.save(READER, STORY, new RatingRequest(4, "  Hay. "));

        verify(mapper).upsert(120, STORY, 4, "Hay.");
        verify(cache).evict("cache:story:1");
        assertThat(res.ratingAvg()).isEqualByComparingTo("4.31");
        assertThat(res.ratingCount()).isEqualTo(173);
        assertThat(res.rating().score()).isEqualTo(4);
    }

    @Test
    void blankReviewIsStoredAsNull() {
        service.save(READER, STORY, new RatingRequest(5, "   "));

        verify(mapper).upsert(eq(120), eq(STORY), eq(5), isNull());
    }

    @Test
    void adminCannotRateNorDelete() {
        SessionUser admin = new SessionUser(1, "admin", "ADMIN");

        assertCode(() -> service.save(admin, STORY, new RatingRequest(5, null)), ErrorCode.ADMIN_CANNOT_RATE);
        assertCode(() -> service.delete(admin, STORY), ErrorCode.ADMIN_CANNOT_RATE);
        verifyNoInteractions(cache);
        verify(mapper, never()).upsert(anyInt(), anyInt(), anyInt(), any());
        verify(mapper, never()).delete(anyInt(), anyInt());
    }

    @Test
    void authorCannotRateOwnStory() {
        SessionUser author = new SessionUser(AUTHOR, "author", "AUTHOR");

        assertCode(() -> service.save(author, STORY, new RatingRequest(5, null)), ErrorCode.CANNOT_RATE_OWN_STORY);
        verify(mapper, never()).upsert(anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void authorMayRateOtherStories() {
        SessionUser otherAuthor = new SessionUser(99, "other", "AUTHOR");
        when(mapper.findMine(99, STORY)).thenReturn(rating(3));

        service.save(otherAuthor, STORY, new RatingRequest(3, null));

        verify(mapper).upsert(99, STORY, 3, null);
    }

    @Test
    void storyThatIsNotPublicIsNotFound() {
        when(mapper.publicStoryAuthorId(9)).thenReturn(null);

        assertCode(() -> service.save(READER, 9, new RatingRequest(5, null)), ErrorCode.STORY_NOT_FOUND);
        assertCode(() -> service.list(9, null, null, false), ErrorCode.STORY_NOT_FOUND);
        assertCode(() -> service.mine(120, 9), ErrorCode.STORY_NOT_FOUND);
    }

    @Test
    void deleteEvictsOnlyWhenARowWasRemoved() {
        when(mapper.delete(120, STORY)).thenReturn(0);
        service.delete(READER, STORY);
        verifyNoInteractions(cache);

        when(mapper.delete(120, STORY)).thenReturn(1);
        service.delete(READER, STORY);
        verify(cache).evict("cache:story:1");
    }

    @Test
    void mineIsEmptyWhenNotRated() {
        when(mapper.findMine(120, STORY)).thenReturn(null);

        assertThat(service.mine(120, STORY)).isEmpty();
    }

    @Test
    void distributionHasEveryScoreInOrder() {
        assertThat(StoryRatingsResponse.distribution(List.of(score(5, 43), score(1, 1), score(4, 32))))
                .containsExactly(java.util.Map.entry("1", 1), java.util.Map.entry("2", 0), java.util.Map.entry("3", 0),
                        java.util.Map.entry("4", 32), java.util.Map.entry("5", 43));
    }

    @Test
    void listWithNoMatchingRatingsSkipsThePageQuery() {
        when(mapper.countByStory(STORY, true)).thenReturn(0L);
        when(mapper.distribution(STORY)).thenReturn(List.of());

        var res = service.list(STORY, null, null, true);

        assertThat(res.reviews().items()).isEmpty();
        assertThat(res.distribution()).containsValues(0);
        verify(mapper, never()).pageByStory(anyInt(), anyBoolean(), anyInt(), anyInt());
    }
}
