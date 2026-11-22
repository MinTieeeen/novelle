package com.novelle.controller;

import java.util.List;

import com.novelle.dto.CreateGenreRequest;
import com.novelle.dto.GenreAdminResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.RenameTagRequest;
import com.novelle.dto.TagResponse;
import com.novelle.dto.UpdateGenreRequest;
import com.novelle.service.AdminCatalogService;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Genres and tags (F12, docs/module-admin.md G1–G4, T1–T3). ADMIN only (SecurityConfig). */
@Tag(name = "Admin — catalog")
@RestController
@RequestMapping("/api/admin")
public class AdminCatalogController {

    private final AdminCatalogService catalogService;

    public AdminCatalogController(AdminCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @Operation(summary = "Every genre with the number of stories using it (drafts and hidden ones included)")
    @GetMapping("/genres")
    public List<GenreAdminResponse> genres() {
        return catalogService.genres();
    }

    @Operation(summary = "Create a genre; the slug comes from the name (CSRF)")
    @PostMapping("/genres")
    @ResponseStatus(HttpStatus.CREATED)
    public GenreAdminResponse createGenre(@Valid @RequestBody CreateGenreRequest body) {
        return catalogService.createGenre(body);
    }

    @Operation(summary = "Edit name, description or order of a genre; the slug never changes (CSRF)")
    @PatchMapping("/genres/{genreId}")
    public GenreAdminResponse updateGenre(@PathVariable int genreId, @Valid @RequestBody UpdateGenreRequest body) {
        return catalogService.updateGenre(genreId, body);
    }

    @Operation(summary = "Delete a genre no story uses (409 GENRE_IN_USE otherwise; CSRF)")
    @DeleteMapping("/genres/{genreId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteGenre(@PathVariable int genreId) {
        catalogService.deleteGenre(genreId);
    }

    @Operation(summary = "Tags, most used first, optionally filtered by name")
    @GetMapping("/tags")
    public PageResponse<TagResponse> tags(@RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return catalogService.tags(q, page, size);
    }

    @Operation(summary = "Rename a tag; its slug follows (CSRF)")
    @PatchMapping("/tags/{tagId}")
    public TagResponse renameTag(@PathVariable int tagId, @Valid @RequestBody RenameTagRequest body) {
        return catalogService.renameTag(tagId, body.name());
    }

    @Operation(summary = "Delete a tag and remove it from every story (CSRF)")
    @DeleteMapping("/tags/{tagId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTag(@PathVariable int tagId) {
        catalogService.deleteTag(tagId);
    }
}
