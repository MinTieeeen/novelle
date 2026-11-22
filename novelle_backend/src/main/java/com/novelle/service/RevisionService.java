package com.novelle.service;

import java.time.Instant;
import java.util.List;

import com.novelle.dto.RevisionResponse;
import com.novelle.dto.StudioChapterResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.RevisionMapper;
import com.novelle.model.ChapterRevision;
import com.novelle.model.StudioChapter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Revisions of my chapters (R1–R3, RB10). Revisions are never changed: restoring one writes its text into the
 * chapter through the normal save ({@link ChapterService#applyContent}), so the trigger keeps the text being
 * replaced as a new revision.
 */
@Service
public class RevisionService {

    private final RevisionMapper revisionMapper;
    private final StudioOwnership ownership;
    private final ChapterService chapterService;

    public RevisionService(RevisionMapper revisionMapper, StudioOwnership ownership, ChapterService chapterService) {
        this.revisionMapper = revisionMapper;
        this.ownership = ownership;
        this.chapterService = chapterService;
    }

    /** R1: at most 10 (the trigger removes older ones), newest first, without content. */
    @Transactional(readOnly = true)
    public List<RevisionResponse> list(int authorId, long chapterId) {
        ownership.chapter(chapterId, authorId, false);
        return revisionMapper.findRevisions(chapterId).stream().map(RevisionResponse::from).toList();
    }

    /** R2. */
    @Transactional(readOnly = true)
    public RevisionResponse get(int authorId, long chapterId, int revisionNo) {
        ownership.chapter(chapterId, authorId, false);
        return RevisionResponse.from(require(chapterId, revisionNo));
    }

    /** R3: the volume is kept; {@code version} is the chapter's current one (409 when it changed). */
    @Transactional
    public StudioChapterResponse restore(int authorId, long chapterId, int revisionNo, Instant version) {
        StudioChapter chapter = ownership.chapter(chapterId, authorId, false);
        ChapterRevision revision = require(chapterId, revisionNo);
        return chapterService.applyContent(authorId, chapter, revision.getTitle(), revision.getContent(),
                chapter.getVolumeId(), version);
    }

    private ChapterRevision require(long chapterId, int revisionNo) {
        ChapterRevision revision = revisionMapper.findRevision(chapterId, revisionNo);
        if (revision == null) {
            throw new ApiException(ErrorCode.REVISION_NOT_FOUND);
        }
        return revision;
    }
}
