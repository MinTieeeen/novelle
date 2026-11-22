package com.novelle.controller;

import java.util.List;

import com.novelle.dto.RestoreRevisionRequest;
import com.novelle.dto.RevisionResponse;
import com.novelle.dto.StudioChapterResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.RevisionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Revisions of my chapters (R1–R3, RB10). AUTHOR only (SecurityConfig). */
@Tag(name = "Studio — chapters")
@RestController
public class StudioRevisionController {

    private final RevisionService revisionService;
    private final CurrentUser currentUser;

    public StudioRevisionController(RevisionService revisionService, CurrentUser currentUser) {
        this.revisionService = revisionService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "The 10 most recent revisions of my chapter, newest first, without content")
    @GetMapping("/api/studio/chapters/{chapterId}/revisions")
    public List<RevisionResponse> list(@PathVariable long chapterId) {
        return revisionService.list(currentUser.requireId(), chapterId);
    }

    @Operation(summary = "One revision with its content")
    @GetMapping("/api/studio/chapters/{chapterId}/revisions/{revisionNo}")
    public RevisionResponse get(@PathVariable long chapterId, @PathVariable int revisionNo) {
        return revisionService.get(currentUser.requireId(), chapterId, revisionNo);
    }

    @Operation(summary = "Restore a revision into the chapter; the current text becomes a new revision (CSRF)")
    @PostMapping("/api/studio/chapters/{chapterId}/revisions/{revisionNo}/restore")
    public StudioChapterResponse restore(@PathVariable long chapterId, @PathVariable int revisionNo,
            @Valid @RequestBody RestoreRevisionRequest body) {
        return revisionService.restore(currentUser.requireId(), chapterId, revisionNo, body.version());
    }
}
