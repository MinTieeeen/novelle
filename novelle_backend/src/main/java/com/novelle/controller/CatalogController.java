package com.novelle.controller;

import java.util.List;

import com.novelle.dto.GenreResponse;
import com.novelle.dto.TagQueryRequest;
import com.novelle.dto.TagResponse;
import com.novelle.service.CatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Genres and tag suggestions (public). */
@Tag(name = "Catalog")
@RestController
@RequestMapping("/api")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @Operation(summary = "All genres in display order, with the number of public stories (cached 1h)")
    @GetMapping("/genres")
    public List<GenreResponse> genres() {
        return catalogService.getGenres();
    }

    @Operation(summary = "Most used tags, optionally those whose name or slug starts with q")
    @GetMapping("/tags")
    public List<TagResponse> tags(@Valid @ParameterObject @ModelAttribute TagQueryRequest query) {
        return catalogService.findTags(query.q(), query.limit());
    }
}
