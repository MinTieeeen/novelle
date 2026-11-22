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

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import com.novelle.config.StudioProperties;
import com.novelle.dto.DraftRequest;
import com.novelle.dto.SaveChapterRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.HtmlSanitizer;
import com.novelle.infrastructure.html.WordCounter;
import com.novelle.mapper.SessionContextMapper;
import com.novelle.mapper.StudioChapterMapper;
import com.novelle.model.ChapterDraft;
import com.novelle.model.StudioChapter;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ChapterServiceTest {

    private static final int AUTHOR = 5;
    private static final int STORY = 70;
    private static final long CHAPTER = 880L;
    private static final Instant NOW = Instant.parse("2026-11-09T10:00:00Z");
    private static final Instant VERSION = Instant.parse("2026-11-09T09:00:00.123Z");
    private static final LocalDateTime VERSION_DB = LocalDateTime.of(2026, 11, 9, 9, 0, 0, 123_000_000);

    private StudioChapterMapper mapper;
    private SessionContextMapper sessionContext;
    private StudioOwnership ownership;
    private DraftService drafts;
    private CacheService cache;
    private ChapterService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StudioChapterMapper.class);
        sessionContext = mock(SessionContextMapper.class);
        ownership = mock(StudioOwnership.class);
        drafts = mock(DraftService.class);
        cache = mock(CacheService.class);
        StudioProperties props = new StudioProperties(Duration.ofDays(7), 100, Duration.ofMinutes(1),
                Duration.ofDays(365), Duration.ofSeconds(60));
        service = new ChapterService(mapper, sessionContext, ownership, new HtmlSanitizer(), new WordCounter(),
                drafts, cache, props, Clock.fixed(NOW, ZoneOffset.UTC));
        mine("DRAFT", 3);
    }

    private StudioChapter mine(String status, int words) {
        StudioChapter c = new StudioChapter();
        c.setChapterId(CHAPTER);
        c.setStoryId(STORY);
        c.setStatus(status);
        c.setWordCount(words);
        c.setUpdatedAt(LocalDateTime.of(2026, 11, 9, 9, 0));
        when(ownership.chapter(eq(CHAPTER), eq(AUTHOR), any(Boolean.class))).thenReturn(c);
        return c;
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    private static SaveChapterRequest save(String content) {
        return new SaveChapterRequest("Chương 1", content, null, VERSION);
    }

    /* ---------- save (C6) ---------- */

    @Test
    void saveSetsTheSessionContextBeforeTheUpdateAndSanitizes() {
        when(mapper.updateContent(anyLong(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(1);

        service.save(AUTHOR, CHAPTER, save("<p onclick=\"x\">một hai</p><script>bad()</script>"));

        InOrder order = inOrder(sessionContext, mapper, drafts);
        order.verify(sessionContext).setUserId(AUTHOR);
        order.verify(mapper).updateContent(CHAPTER, "Chương 1", "<p>một hai</p>", 2, null, VERSION_DB);
        order.verify(drafts).delete(AUTHOR, CHAPTER);
    }

    @Test
    void staleVersionIs409AndKeepsTheDraft() {
        when(mapper.updateContent(anyLong(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(0);

        assertCode(() -> service.save(AUTHOR, CHAPTER, save("<p>x</p>")), ErrorCode.STALE_DATA);
        verify(drafts, never()).delete(anyInt(), anyLong());
        verify(mapper, never()).recalcStoryStats(anyInt());
        verifyNoInteractions(cache);
    }

    @Test
    void draftChapterSaveDoesNotTouchStoryStatistics() {
        when(mapper.updateContent(anyLong(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(1);

        service.save(AUTHOR, CHAPTER, save("<p>x</p>"));

        verify(mapper, never()).recalcStoryStats(anyInt());
        verifyNoInteractions(cache);
    }

    @Test
    void publishedChapterSaveRecalculatesAndEvicts() {
        mine("PUBLISHED", 3);
        when(mapper.updateContent(anyLong(), anyString(), anyString(), anyInt(), any(), any())).thenReturn(1);

        service.save(AUTHOR, CHAPTER, save("<p>x</p>"));

        verify(mapper).recalcStoryStats(STORY);
        verify(cache).evict("cache:story:" + STORY, "cache:chapter:" + CHAPTER);
    }

    @Test
    void tooLongContentIsRejectedBeforeAnyRead() {
        assertCode(() -> service.save(AUTHOR, CHAPTER, save("x".repeat(101))), ErrorCode.VALIDATION_FAILED);
        verifyNoInteractions(ownership, sessionContext);
    }

    @Test
    void volumeOfAnotherStoryIsRejected() {
        org.mockito.Mockito.doThrow(new ApiException(ErrorCode.VOLUME_NOT_IN_STORY))
                .when(ownership).requireVolumeInStory(31, STORY);
        SaveChapterRequest req = new SaveChapterRequest("T", "<p>x</p>", 31, VERSION);

        assertCode(() -> service.save(AUTHOR, CHAPTER, req), ErrorCode.VOLUME_NOT_IN_STORY);
        verifyNoInteractions(sessionContext);
    }

    /* ---------- publish (C7) ---------- */

    @Test
    void emptyChapterCannotBePublished() {
        mine("DRAFT", 0);
        assertCode(() -> service.publish(AUTHOR, CHAPTER), ErrorCode.CHAPTER_EMPTY);
        verify(mapper, never()).publish(anyLong(), anyInt());
    }

    @Test
    void publishedChapterIsNotPublishedAgain() {
        mine("PUBLISHED", 3);
        assertCode(() -> service.publish(AUTHOR, CHAPTER), ErrorCode.ALREADY_PROCESSED);
        verify(mapper, never()).publish(anyLong(), anyInt());
    }

    @Test
    void publishCallsTheProcedureAndEvicts() {
        service.publish(AUTHOR, CHAPTER);
        verify(mapper).publish(CHAPTER, AUTHOR);
        verify(cache).evict("cache:story:" + STORY, "cache:chapter:" + CHAPTER, "cache:home");
    }

    /* ---------- schedule (C8, C9) ---------- */

    @Test
    void scheduleNeedsAtLeastTheMinimumLead() {
        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.plusSeconds(30)), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.minusSeconds(60)), ErrorCode.VALIDATION_FAILED);
        verify(mapper, never()).schedule(anyLong(), any());
    }

    @Test
    void scheduleCannotBeTooFarAhead() {
        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.plus(Duration.ofDays(366))), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void scheduleStoresUtcMilliseconds() {
        when(mapper.schedule(anyLong(), any())).thenReturn(1);
        service.schedule(AUTHOR, CHAPTER, Instant.parse("2026-11-10T13:00:00.123456Z"));
        verify(mapper).schedule(CHAPTER, LocalDateTime.of(2026, 11, 10, 13, 0, 0, 123_000_000));
    }

    @Test
    void publishedOrEmptyChapterCannotBeScheduled() {
        mine("PUBLISHED", 3);
        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.plusSeconds(3600)), ErrorCode.CHAPTER_ALREADY_PUBLISHED);
        mine("DRAFT", 0);
        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.plusSeconds(3600)), ErrorCode.CHAPTER_EMPTY);
    }

    @Test
    void scheduleLostToTheJobIs409() {
        when(mapper.schedule(anyLong(), any())).thenReturn(0);
        StudioChapter draft = mine("DRAFT", 3);
        StudioChapter published = new StudioChapter();
        published.setStatus("PUBLISHED");
        when(ownership.chapter(CHAPTER, AUTHOR, false)).thenReturn(draft, published);

        assertCode(() -> service.schedule(AUTHOR, CHAPTER, NOW.plusSeconds(3600)), ErrorCode.CHAPTER_ALREADY_PUBLISHED);
    }

    @Test
    void unscheduleNeedsAScheduledChapter() {
        assertCode(() -> service.unschedule(AUTHOR, CHAPTER), ErrorCode.ALREADY_PROCESSED);
        verify(mapper, never()).unschedule(anyLong());
    }

    /* ---------- delete (C10) ---------- */

    @Test
    void deletingADraftLeavesStatisticsAlone() {
        service.delete(AUTHOR, CHAPTER);
        verify(mapper).softDelete(CHAPTER);
        verify(drafts).delete(AUTHOR, CHAPTER);
        verify(mapper, never()).recalcStoryStats(anyInt());
    }

    @Test
    void deletingAPublishedChapterRecalculates() {
        mine("PUBLISHED", 3);
        service.delete(AUTHOR, CHAPTER);
        verify(mapper).recalcStoryStats(STORY);
        verify(cache).evict("cache:story:" + STORY, "cache:chapter:" + CHAPTER, "cache:home");
    }

    /* ---------- drafts (C3, C4) ---------- */

    @Test
    void getReturnsTheDraftOnlyWhenNewer() {
        Instant stored = LocalDateTime.of(2026, 11, 9, 9, 0).toInstant(ZoneOffset.UTC);
        when(drafts.find(AUTHOR, CHAPTER)).thenReturn(Optional.of(new ChapterDraft("t", "c", stored.plusSeconds(1))));
        assertThat(service.get(AUTHOR, CHAPTER).draft()).isNotNull();

        when(drafts.find(AUTHOR, CHAPTER)).thenReturn(Optional.of(new ChapterDraft("t", "c", stored.minusSeconds(1))));
        assertThat(service.get(AUTHOR, CHAPTER).draft()).isNull();
    }

    @Test
    void draftSaveReportsRedisFailure() {
        when(drafts.save(AUTHOR, CHAPTER, "t", "c")).thenReturn(Optional.empty());
        assertThat(service.saveDraft(AUTHOR, CHAPTER, new DraftRequest("t", "c")).saved()).isFalse();

        when(drafts.save(AUTHOR, CHAPTER, "t", "c")).thenReturn(Optional.of(NOW));
        assertThat(service.saveDraft(AUTHOR, CHAPTER, new DraftRequest("t", "c")).savedAt()).isEqualTo(NOW);
    }
}
