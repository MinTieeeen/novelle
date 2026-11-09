package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.FollowMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class FollowServiceTest {

    private static final int USER = 120;
    private static final int STORY = 1;
    private static final int AUTHOR = 4;

    private FollowMapper followMapper;
    private ReadingHistoryMapper historyMapper;
    private CacheService cache;
    private FollowService service;

    @BeforeEach
    void setUp() {
        followMapper = mock(FollowMapper.class);
        historyMapper = mock(ReadingHistoryMapper.class);
        cache = mock(CacheService.class);
        service = new FollowService(followMapper, historyMapper, cache);
        when(historyMapper.existsPublicStory(STORY)).thenReturn(true);
        when(followMapper.storyFollowCount(STORY)).thenReturn(313);
        when(followMapper.authorFollowerCount(AUTHOR)).thenReturn(105);
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- stories ---------- */

    @Test
    void followAddsARowAndEvictsTheStoryCache() {
        when(followMapper.followStory(USER, STORY)).thenReturn(1);

        var res = service.followStory(USER, STORY);

        assertThat(res.following()).isTrue();
        assertThat(res.followCount()).isEqualTo(313);
        verify(cache).evict("cache:story:1");
    }

    @Test
    void followingAgainChangesNothingAndKeepsTheCache() {
        when(followMapper.followStory(USER, STORY)).thenReturn(0);

        assertThat(service.followStory(USER, STORY).following()).isTrue();
        verifyNoInteractions(cache);
    }

    @Test
    void concurrentDuplicateInsertCountsAsAlreadyFollowing() {
        when(followMapper.followStory(USER, STORY)).thenThrow(new DuplicateKeyException("PK_Follow"));

        assertThat(service.followStory(USER, STORY).following()).isTrue();
        verifyNoInteractions(cache);
    }

    @Test
    void cannotFollowAStoryThatIsNotPublic() {
        when(historyMapper.existsPublicStory(STORY)).thenReturn(false);

        assertCode(() -> service.followStory(USER, STORY), ErrorCode.STORY_NOT_FOUND);
        assertCode(() -> service.storyStatus(USER, STORY), ErrorCode.STORY_NOT_FOUND);
        verify(followMapper, never()).followStory(anyInt(), anyInt());
    }

    @Test
    void unfollowWorksForAHiddenStory() {
        when(historyMapper.existsPublicStory(STORY)).thenReturn(false);
        when(followMapper.unfollowStory(USER, STORY)).thenReturn(1);

        var res = service.unfollowStory(USER, STORY);

        assertThat(res.following()).isFalse();
        verify(cache).evict("cache:story:1");
    }

    @Test
    void unfollowOfAnUnknownStoryIsNotFound() {
        when(followMapper.storyFollowCount(9)).thenReturn(null);

        assertCode(() -> service.unfollowStory(USER, 9), ErrorCode.STORY_NOT_FOUND);
        verify(followMapper, never()).unfollowStory(anyInt(), anyInt());
    }

    @Test
    void unfollowWhenNotFollowingKeepsTheCache() {
        when(followMapper.unfollowStory(USER, STORY)).thenReturn(0);

        service.unfollowStory(USER, STORY);

        verifyNoInteractions(cache);
    }

    /* ---------- authors ---------- */

    @Test
    void followAnAuthor() {
        var res = service.followAuthor(USER, AUTHOR);

        assertThat(res.following()).isTrue();
        assertThat(res.followerCount()).isEqualTo(105);
        verify(followMapper).followAuthor(USER, AUTHOR);
    }

    @Test
    void anAuthorCannotFollowThemself() {
        assertCode(() -> service.followAuthor(AUTHOR, AUTHOR), ErrorCode.CANNOT_FOLLOW_SELF);
        verify(followMapper, never()).followAuthor(anyInt(), anyInt());
    }

    @Test
    void unknownAuthorIsNotFound() {
        when(followMapper.authorFollowerCount(9)).thenReturn(null);

        assertCode(() -> service.followAuthor(USER, 9), ErrorCode.AUTHOR_NOT_FOUND);
        assertCode(() -> service.unfollowAuthor(USER, 9), ErrorCode.AUTHOR_NOT_FOUND);
        assertCode(() -> service.authorStatus(USER, 9), ErrorCode.AUTHOR_NOT_FOUND);
    }

    @Test
    void concurrentDuplicateAuthorFollowIsIgnored() {
        when(followMapper.followAuthor(USER, AUTHOR)).thenThrow(new DuplicateKeyException("PK_AuthorFollow"));

        assertThat(service.followAuthor(USER, AUTHOR).following()).isTrue();
    }

    @Test
    void emptyListsSkipThePageQuery() {
        assertThat(service.followedStories(USER, null, null).items()).isEmpty();
        assertThat(service.followedAuthors(USER, null, null).items()).isEmpty();
        verify(followMapper, never()).pageFollowedStories(anyInt(), anyInt(), anyInt());
        verify(followMapper, never()).pageFollowedAuthors(anyInt(), anyInt(), anyInt());
    }
}
