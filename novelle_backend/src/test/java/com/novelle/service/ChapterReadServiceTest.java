package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.function.Supplier;

import com.novelle.dto.ChapterReadResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.infrastructure.views.ViewCounterService;
import com.novelle.mapper.ChapterMapper;
import com.novelle.mapper.ReadingHistoryMapper;
import com.novelle.model.AuthorRef;
import com.novelle.model.ChapterContent;
import com.novelle.model.ChapterNav;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ChapterReadServiceTest {

    private static final CacheTtlProperties TTL = new CacheTtlProperties(Duration.ofHours(1), Duration.ofMinutes(2),
            Duration.ofMinutes(10), Duration.ofMinutes(30), Duration.ofMinutes(5));

    private ChapterMapper chapterMapper;
    private ReadingHistoryMapper historyMapper;
    private CacheService cache;
    private ViewCounterService views;
    private ChapterReadService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        chapterMapper = mock(ChapterMapper.class);
        historyMapper = mock(ReadingHistoryMapper.class);
        cache = mock(CacheService.class);
        views = mock(ViewCounterService.class);
        when(cache.getOrLoad(anyString(), any(Duration.class), any(Class.class), any(Supplier.class)))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(3)).get());
        service = new ChapterReadService(chapterMapper, historyMapper, cache, TTL, views);
    }

    private static ChapterNav nav() {
        AuthorRef author = new AuthorRef();
        author.setAuthorId(4);
        author.setPenName("Lăng Du");
        ChapterNav nav = new ChapterNav();
        nav.setChapterId(2);
        nav.setChapterNo(2);
        nav.setStoryId(1);
        nav.setStorySlug("hoa-no-diu-dang");
        nav.setStoryTitle("Hoa Nở Dịu Dàng");
        nav.setAuthor(author);
        nav.setPrevChapterId(1L);
        nav.setNextChapterId(3L);
        nav.setViewCount(6901);
        return nav;
    }

    private static ChapterContent content() {
        ChapterContent c = new ChapterContent();
        c.setTitle("Chương 2");
        c.setContent("<p>…</p>");
        c.setWordCount(2726);
        c.setPublishedAt(LocalDateTime.of(2026, 1, 11, 2, 57, 2));
        return c;
    }

    @Test
    void notPublicIs404AndHasNoSideEffect() {
        assertThatThrownBy(() -> service.read(2, 17, "203.0.113.7"))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.code()).isEqualTo(ErrorCode.CHAPTER_NOT_FOUND));

        verifyNoInteractions(cache, historyMapper, views);
    }

    @Test
    void contentGoneBetweenTheTwoReadsIs404WithoutCountingAView() {
        when(chapterMapper.findPublicNav(2)).thenReturn(nav());

        assertThatThrownBy(() -> service.read(2, null, "203.0.113.7"))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.code()).isEqualTo(ErrorCode.CHAPTER_NOT_FOUND));
        verify(views, never()).record(anyInt(), anyLong(), any(), anyString());
    }

    @Test
    void guestReadsCountsAViewAndDoesNotTouchHistory() {
        when(chapterMapper.findPublicNav(2)).thenReturn(nav());
        when(chapterMapper.findContent(2)).thenReturn(content());

        ChapterReadResponse r = service.read(2, null, "203.0.113.7");

        assertThat(r.title()).isEqualTo("Chương 2");
        assertThat(r.story().slug()).isEqualTo("hoa-no-diu-dang");
        assertThat(r.story().author().penName()).isEqualTo("Lăng Du");
        assertThat(r.volume()).isNull();
        assertThat(r.prevChapterId()).isEqualTo(1L);
        assertThat(r.nextChapterId()).isEqualTo(3L);
        assertThat(r.myScrollPercent()).isNull();
        assertThat(r.publishedAt()).hasToString("2026-01-11T02:57:02Z");
        verify(cache).getOrLoad(eq("cache:chapter:2"), eq(Duration.ofMinutes(30)), any(Class.class), any());
        verify(historyMapper, never()).touch(anyInt(), anyInt(), anyLong());
        verify(views).record(1, 2, null, "203.0.113.7");
    }

    @Test
    void loggedInReaderGetsScrollPositionAndViewIsCountedLast() {
        when(chapterMapper.findPublicNav(2)).thenReturn(nav());
        when(chapterMapper.findContent(2)).thenReturn(content());
        when(historyMapper.touch(17, 1, 2)).thenReturn(new BigDecimal("55.56"));

        ChapterReadResponse r = service.read(2, 17, "203.0.113.7");

        assertThat(r.myScrollPercent()).isEqualByComparingTo("55.56");
        InOrder order = inOrder(chapterMapper, historyMapper, views);
        order.verify(chapterMapper).findPublicNav(2);
        order.verify(historyMapper).touch(17, 1, 2);
        order.verify(views).record(1, 2, 17, "203.0.113.7");
    }
}
