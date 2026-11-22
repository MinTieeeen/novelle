package com.novelle.controller;

import java.util.List;

import com.novelle.dto.VolumeRequest;
import com.novelle.dto.VolumeResponse;
import com.novelle.infrastructure.security.CurrentUser;
import com.novelle.service.VolumeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Volumes of my stories (V1–V4). AUTHOR only (SecurityConfig). */
@Tag(name = "Studio — chapters")
@RestController
public class StudioVolumeController {

    private final VolumeService volumeService;
    private final CurrentUser currentUser;

    public StudioVolumeController(VolumeService volumeService, CurrentUser currentUser) {
        this.volumeService = volumeService;
        this.currentUser = currentUser;
    }

    @Operation(summary = "Volumes of my story in order, with their chapter counts")
    @GetMapping("/api/studio/stories/{storyId}/volumes")
    public List<VolumeResponse> list(@PathVariable int storyId) {
        return volumeService.list(currentUser.requireId(), storyId);
    }

    @Operation(summary = "Add a volume at the end (VolumeNo = MAX + 1; CSRF)")
    @PostMapping("/api/studio/stories/{storyId}/volumes")
    @ResponseStatus(HttpStatus.CREATED)
    public VolumeResponse create(@PathVariable int storyId, @Valid @RequestBody VolumeRequest body) {
        return volumeService.create(currentUser.requireId(), storyId, body.title());
    }

    @Operation(summary = "Rename a volume (CSRF)")
    @PatchMapping("/api/studio/volumes/{volumeId}")
    public VolumeResponse rename(@PathVariable int volumeId, @Valid @RequestBody VolumeRequest body) {
        return volumeService.rename(currentUser.requireId(), volumeId, body.title());
    }

    @Operation(summary = "Delete a volume without chapters, deleted ones included (409 VOLUME_NOT_EMPTY; CSRF)")
    @DeleteMapping("/api/studio/volumes/{volumeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int volumeId) {
        volumeService.delete(currentUser.requireId(), volumeId);
    }
}
