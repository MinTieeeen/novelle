package com.novelle.controller;

import java.util.List;

import com.novelle.dto.ChapterListItemResponse;
import com.novelle.dto.CreateChapterRequest;
import com.novelle.dto.DraftRequest;
import com.novelle.dto.DraftSaveResponse;
import com.novelle.dto.SaveChapterRequest;
import com.novelle.dto.ScheduleChapterRequest;
import com.novelle.dto.StudioChapterResponse;
import com.novelle.infrastructure.ratelimit.RateLimited;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.ChapterService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Chapters of my stories (F9, docs/module-studio.md C1–C10). AUTHOR only (SecurityConfig). */
@Tag(name = "Studio — chapters")
@RestController
public class StudioChapterController {

    private final ChapterService chapterService;
    private final CurrentUser currentUser;

    public StudioChapterController(ChapterService chapterService, CurrentUser currentUser) {
        this.chapterService = chapterService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Every chapter of my story that is not deleted (draft, scheduled, published), no content")
    @GetMapping("/api/studio/stories/{storyId}/chapters")
    public List<ChapterListItemResponse> list(@PathVariable int storyId) {
        return chapterService.list(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Add a DRAFT chapter at the end (ChapterNo = MAX + 1); content is sanitized (CSRF)")
    @PostMapping("/api/studio/stories/{storyId}/chapters")
    @ResponseStatus(HttpStatus.CREATED)
    public StudioChapterResponse create(@PathVariable int storyId, @Valid @RequestBody CreateChapterRequest body) {
        return chapterService.create(currentUser.requireId(), storyId, body);
    }

    @Operation(summary = "A chapter for editing: content, version, and the autosaved draft when it is newer")
    @GetMapping("/api/studio/chapters/{chapterId}")
    public StudioChapterResponse get(@PathVariable long chapterId) {
        return chapterService.get(currentUser.requireId(), chapterId);
    }

    @Operation(summary = "Autosave a draft to Redis only (TTL 7 days); saved = false when Redis is down "
            + "(rate limit draft; CSRF)")
    @PutMapping("/api/studio/chapters/{chapterId}/draft")
    @RateLimited(value = "draft", scope = RateLimited.Scope.USER)
    public DraftSaveResponse saveDraft(@PathVariable long chapterId, @Valid @RequestBody DraftRequest body) {
        return chapterService.saveDraft(currentUser.requireId(), chapterId, body);
    }

    @Operation(summary = "Discard the autosaved draft (CSRF)")
    @DeleteMapping("/api/studio/chapters/{chapterId}/draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void discardDraft(@PathVariable long chapterId) {
        chapterService.discardDraft(currentUser.requireId(), chapterId);
    }

    @Operation(summary = "Save title, content and volume; an old version gives 409 STALE_DATA; "
            + "the previous text becomes a revision (CSRF)")
    @PutMapping("/api/studio/chapters/{chapterId}")
    public StudioChapterResponse save(@PathVariable long chapterId, @Valid @RequestBody SaveChapterRequest body) {
        return chapterService.save(currentUser.requireId(), chapterId, body);
    }

    @Operation(summary = "Publish now (sp_PublishChapter); empty chapter → 409 (rate limit publish; CSRF)")
    @PostMapping("/api/studio/chapters/{chapterId}/publish")
    @RateLimited(value = "publish", scope = RateLimited.Scope.USER)
    public StudioChapterResponse publish(@PathVariable long chapterId) {
        return chapterService.publish(currentUser.requireId(), chapterId);
    }

    @Operation(summary = "Schedule (or move the schedule of) a draft chapter; published by the job when due (CSRF)")
    @PostMapping("/api/studio/chapters/{chapterId}/schedule")
    public StudioChapterResponse schedule(@PathVariable long chapterId,
            @Valid @RequestBody ScheduleChapterRequest body) {
        return chapterService.schedule(currentUser.requireId(), chapterId, body.scheduledAt());
    }

    @Operation(summary = "Cancel the schedule: SCHEDULED → DRAFT (CSRF)")
    @PostMapping("/api/studio/chapters/{chapterId}/unschedule")
    public StudioChapterResponse unschedule(@PathVariable long chapterId) {
        return chapterService.unschedule(currentUser.requireId(), chapterId);
    }

    @Operation(summary = "Soft-delete a chapter; story statistics follow when it was published (CSRF)")
    @DeleteMapping("/api/studio/chapters/{chapterId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long chapterId) {
        chapterService.delete(currentUser.requireId(), chapterId);
    }
}
