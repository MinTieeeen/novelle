package com.novelle.controller;

import com.novelle.dto.ChapterReadResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.infrastructure.security.SessionUser;
import com.novelle.service.ChapterReadService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reading a published chapter (F4). Public: GET /api/chapters/** is permitted in SecurityConfig. */
@Tag(name = "Reading")
@RestController
@RequestMapping("/api/chapters")
public class ChapterController {

    private final ChapterReadService chapterReadService;
    private final CurrentUser currentUser;

    public ChapterController(ChapterReadService chapterReadService, CurrentUser currentUser) {
        this.chapterReadService = chapterReadService;
        this.currentUser = currentUser;
    }

    /*
     * The guest viewer id is the socket address; X-Forwarded-For is ignored on purpose (same reasoning as
     * RateLimitInterceptor: a client-supplied header would let anyone count unlimited views).
     */
    @Operation(summary = "Read a published chapter with story, volume and previous / next chapter. Side effects: "
            + "counts one view (once per viewer and chapter every 30 minutes) and, when logged in, moves the "
            + "reading position to this chapter (scroll kept when it is the same chapter, returned as "
            + "myScrollPercent)")
    @GetMapping("/{chapterId}")
    public ChapterReadResponse read(@PathVariable long chapterId, HttpServletRequest request) {
        Integer userId = currentUser.find().map(SessionUser::userId).orElse(null);
        return chapterReadService.read(chapterId, userId, request.getRemoteAddr());
    }
}
