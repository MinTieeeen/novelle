package com.novelle.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

import com.novelle.config.StudioProperties;
import com.novelle.dto.ChapterListItemResponse;
import com.novelle.dto.CreateChapterRequest;
import com.novelle.dto.DraftRequest;
import com.novelle.dto.DraftSaveResponse;
import com.novelle.dto.SaveChapterRequest;
import com.novelle.dto.StudioChapterResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.HtmlSanitizer;
import com.novelle.infrastructure.html.WordCounter;
import com.novelle.mapper.SessionContextMapper;
import com.novelle.mapper.StudioChapterMapper;
import com.novelle.model.ChapterDraft;
import com.novelle.model.StudioChapter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Chapters of my stories (F9, docs/module-studio.md C1–C10).
 * <ul>
 *   <li>Content is sanitized ({@link HtmlSanitizer}) and counted ({@link WordCounter}) on every write.</li>
 *   <li>Saving uses {@code UpdatedAt} as optimistic lock (D4) and sets {@code SESSION_CONTEXT user_id} first, on the
 *       same connection, for trg_Chapter_Revision (NFR-M6-06).</li>
 *   <li>Changes to a published chapter recalculate the story statistics in the same transaction and evict
 *       {@code cache:story} / {@code cache:chapter}.</li>
 *   <li>Status changes carry their preconditions in the UPDATE; a 0-row result is read again to explain it.</li>
 * </ul>
 */
@Service
public class ChapterService {

    static final String DRAFT = "DRAFT";
    static final String SCHEDULED = "SCHEDULED";
    static final String PUBLISHED = "PUBLISHED";

    private final StudioChapterMapper chapterMapper;
    private final SessionContextMapper sessionContext;
    private final StudioOwnership ownership;
    private final HtmlSanitizer sanitizer;
    private final WordCounter wordCounter;
    private final DraftService drafts;
    private final CacheService cache;
    private final StudioProperties properties;
    private final Clock clock;

    @Autowired
    public ChapterService(StudioChapterMapper chapterMapper, SessionContextMapper sessionContext,
                          StudioOwnership ownership, HtmlSanitizer sanitizer, WordCounter wordCounter,
                          DraftService drafts, CacheService cache, StudioProperties properties) {
        this(chapterMapper, sessionContext, ownership, sanitizer, wordCounter, drafts, cache, properties,
                Clock.systemUTC());
    }

    ChapterService(StudioChapterMapper chapterMapper, SessionContextMapper sessionContext,
                   StudioOwnership ownership, HtmlSanitizer sanitizer, WordCounter wordCounter,
                   DraftService drafts, CacheService cache, StudioProperties properties, Clock clock) {
        this.chapterMapper = chapterMapper;
        this.sessionContext = sessionContext;
        this.ownership = ownership;
        this.sanitizer = sanitizer;
        this.wordCounter = wordCounter;
        this.drafts = drafts;
        this.cache = cache;
        this.properties = properties;
        this.clock = clock;
    }

    /* ---------- reading ---------- */

    /** C1: every chapter that is not deleted, without content. */
    @Transactional(readOnly = true)
    public List<ChapterListItemResponse> list(int authorId, int storyId) {
        ownership.story(storyId, authorId);
        return chapterMapper.listByStory(storyId).stream().map(ChapterListItemResponse::from).toList();
    }

    /** C3: the stored chapter, plus the autosaved draft when it is newer (D8). */
    @Transactional(readOnly = true)
    public StudioChapterResponse get(int authorId, long chapterId) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, true);
        Instant stored = chapter.getUpdatedAt().toInstant(ZoneOffset.UTC);
        ChapterDraft draft = drafts.find(authorId, chapterId)
                .filter(d -> d.savedAt().isAfter(stored))
                .orElse(null);
        return StudioChapterResponse.from(chapter, draft);
    }

    /* ---------- drafts (Redis only) ---------- */

    /** C4. The ownership check reads no content; the draft is stored as typed (sanitized only when saved). */
    @Transactional(readOnly = true)
    public DraftSaveResponse saveDraft(int authorId, long chapterId, DraftRequest req) {
        checkLength(req.content());
        ownership.chapter(chapterId, authorId, false);
        return drafts.save(authorId, chapterId, req.title(), req.content())
                .map(DraftSaveResponse::saved)
                .orElseGet(DraftSaveResponse::notSaved);
    }

    /** C5. */
    @Transactional(readOnly = true)
    public void discardDraft(int authorId, long chapterId) {
        ownership.chapter(chapterId, authorId, false);
        drafts.delete(authorId, chapterId);
    }

    /* ---------- writing ---------- */

    /** C2: a DRAFT chapter numbered MAX + 1 (D7). An insert fires no revision trigger. */
    @Transactional
    public StudioChapterResponse create(int authorId, int storyId, CreateChapterRequest req) {
        ownership.story(storyId, authorId);
        ownership.requireVolumeInStory(req.volumeId(), storyId);
        String content = req.content() == null ? "" : req.content();
        checkLength(content);
        String html = sanitizer.sanitize(content);

        StudioChapter chapter = new StudioChapter();
        chapter.setStoryId(storyId);
        chapter.setVolumeId(req.volumeId());
        chapter.setTitle(req.title().strip());
        chapter.setContent(html);
        chapter.setWordCount(wordCounter.count(html));
        chapterMapper.insert(chapter);
        return StudioChapterResponse.from(ownership.chapter(chapter.getChapterId(), authorId, true));
    }

    /** C6: full replacement of title, content and volume. */
    @Transactional
    public StudioChapterResponse save(int authorId, long chapterId, SaveChapterRequest req) {
        checkLength(req.content());
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        ownership.requireVolumeInStory(req.volumeId(), chapter.getStoryId());
        return applyContent(authorId, chapter, req.title().strip(), req.content(), req.volumeId(), req.version());
    }

    /**
     * Writes title / content / volume of a chapter already checked to be mine: shared by C6 and the revision
     * restore (R3). Must run inside the caller's transaction, so {@code sp_set_session_context} and the UPDATE use
     * the same connection.
     * <ol>
     *   <li>sanitize and count words;</li>
     *   <li>{@code SESSION_CONTEXT user_id} = the author (read by trg_Chapter_Revision for EditedBy);</li>
     *   <li>{@code UPDATE … WHERE UpdatedAt = version}; 0 rows → 409 STALE_DATA (D4);</li>
     *   <li>the draft is deleted once the UPDATE succeeded (D8);</li>
     *   <li>published chapter: sp_RecalcStoryStats (WordCount may change) and cache eviction.</li>
     * </ol>
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public StudioChapterResponse applyContent(int authorId, StudioChapter chapter, String title, String content,
                                              Integer volumeId, Instant version) {
        String html = sanitizer.sanitize(content);
        int words = wordCounter.count(html);
        sessionContext.setUserId(authorId);
        int rows = chapterMapper.updateContent(chapter.getChapterId(), title, html, words, volumeId,
                StudioStoryService.toDb(version));
        if (rows == 0) {
            throw new ApiException(ErrorCode.STALE_DATA);
        }
        drafts.delete(authorId, chapter.getChapterId());
        if (PUBLISHED.equals(chapter.getStatus())) {
            chapterMapper.recalcStoryStats(chapter.getStoryId());
            cache.evict(CacheKeys.story(chapter.getStoryId()), CacheKeys.chapter(chapter.getChapterId()));
        }
        return StudioChapterResponse.from(ownership.chapter(chapter.getChapterId(), authorId, true));
    }

    /**
     * C7. Not {@code @Transactional}: sp_PublishChapter opens and ends its own transaction (RB9: status,
     * PublishedAt, story statistics, first Story.PublishedAt, ScheduledAt cleared). The read first answers 404 /
     * 409 without calling it; a concurrent publish that wins in between makes the procedure throw 50001 → 409.
     */
    public StudioChapterResponse publish(int authorId, long chapterId) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        if (PUBLISHED.equals(chapter.getStatus())) {
            throw new ApiException(ErrorCode.ALREADY_PROCESSED, "The chapter is already published.");
        }
        if (chapter.getWordCount() == 0) {
            throw new ApiException(ErrorCode.CHAPTER_EMPTY);
        }
        chapterMapper.publish(chapterId, authorId);
        cache.evict(CacheKeys.story(chapter.getStoryId()), CacheKeys.chapter(chapterId), CacheKeys.HOME);
        return StudioChapterResponse.from(ownership.chapter(chapterId, authorId, true));
    }

    /** C8: from DRAFT, or SCHEDULED to move the time; between now + min lead and now + max ahead. */
    @Transactional
    public StudioChapterResponse schedule(int authorId, long chapterId, Instant scheduledAt) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        if (PUBLISHED.equals(chapter.getStatus())) {
            throw new ApiException(ErrorCode.CHAPTER_ALREADY_PUBLISHED);
        }
        if (chapter.getWordCount() == 0) {
            throw new ApiException(ErrorCode.CHAPTER_EMPTY);
        }
        Instant now = clock.instant();
        if (scheduledAt.isBefore(now.plus(properties.scheduleMinLead()))) {
            throw ApiException.invalidField("scheduledAt",
                    "must be at least " + properties.scheduleMinLead().toMinutes() + " minute(s) from now");
        }
        if (scheduledAt.isAfter(now.plus(properties.scheduleMaxAhead()))) {
            throw ApiException.invalidField("scheduledAt",
                    "must be within " + properties.scheduleMaxAhead().toDays() + " days");
        }
        // DATETIME2(3): keep milliseconds only, so the stored value equals what the author sent
        LocalDateTime at = LocalDateTime.ofInstant(scheduledAt.truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC);
        if (chapterMapper.schedule(chapterId, at) == 0) {
            StudioChapter now2 = ownership.chapter(chapterId, authorId, false);
            throw PUBLISHED.equals(now2.getStatus())
                    ? new ApiException(ErrorCode.CHAPTER_ALREADY_PUBLISHED)
                    : new ApiException(ErrorCode.CONFLICT);
        }
        return StudioChapterResponse.from(ownership.chapter(chapterId, authorId, true));
    }

    /** C9: SCHEDULED → DRAFT. The job may publish it first; then the UPDATE changes nothing → 409. */
    @Transactional
    public StudioChapterResponse unschedule(int authorId, long chapterId) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        if (!SCHEDULED.equals(chapter.getStatus()) || chapterMapper.unschedule(chapterId) == 0) {
            throw new ApiException(ErrorCode.ALREADY_PROCESSED, "The chapter is not scheduled.");
        }
        return StudioChapterResponse.from(ownership.chapter(chapterId, authorId, true));
    }

    /** C10: soft delete; a published chapter also updates the story statistics (RB3). */
    @Transactional
    public void delete(int authorId, long chapterId) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        chapterMapper.softDelete(chapterId);
        drafts.delete(authorId, chapterId);
        if (PUBLISHED.equals(chapter.getStatus())) {
            chapterMapper.recalcStoryStats(chapter.getStoryId());
            cache.evict(CacheKeys.story(chapter.getStoryId()), CacheKeys.chapter(chapterId), CacheKeys.HOME);
        }
    }

    /** Limit on the raw body, before sanitizing (app.studio.content-max-length). */
    private void checkLength(String content) {
        if (content != null && content.length() > properties.contentMaxLength()) {
            throw ApiException.invalidField("content",
                    "must have at most " + properties.contentMaxLength() + " characters");
        }
    }
}
