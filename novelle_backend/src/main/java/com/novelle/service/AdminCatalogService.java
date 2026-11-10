package com.novelle.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import com.novelle.dto.CreateGenreRequest;
import com.novelle.dto.GenreAdminResponse;
import com.novelle.dto.PageResponse;
import com.novelle.dto.TagResponse;
import com.novelle.dto.UpdateGenreRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.AdminCatalogMapper;
import com.novelle.model.AdminGenre;
import com.novelle.model.Tag;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Genre and tag management (F12, docs/module-admin.md G1–G4, T1–T3).
 * <ul>
 *   <li>Genre: slug from the name at creation, never changed afterwards; delete only when no StoryGenre row uses it
 *       (D4). Every change evicts {@code cache:genre:list} and {@code cache:home}.</li>
 *   <li>Tag: rename (slug follows the name) or delete with its StoryTag rows in one transaction (D5); the stories
 *       carrying it are evicted.</li>
 *   <li>Name clashes are checked first and the unique indexes are the last guard (DuplicateKeyException → 409).</li>
 * </ul>
 */
@Service
public class AdminCatalogService {

    /** Genre.Slug and Tag.Slug are VARCHAR(60). */
    static final int SLUG_MAX = 60;

    private static final Pattern SPACES = Pattern.compile("\\s+");

    private final AdminCatalogMapper catalogMapper;
    private final SlugGenerator slugs;
    private final CacheService cache;

    public AdminCatalogService(AdminCatalogMapper catalogMapper, SlugGenerator slugs, CacheService cache) {
        this.catalogMapper = catalogMapper;
        this.slugs = slugs;
        this.cache = cache;
    }

    /* ---------- genres ---------- */

    /** G1. */
    @Transactional(readOnly = true)
    public List<GenreAdminResponse> genres() {
        return catalogMapper.listGenres().stream().map(GenreAdminResponse::from).toList();
    }

    /** G2. */
    @Transactional
    public GenreAdminResponse createGenre(CreateGenreRequest req) {
        String name = normalizeName(req.name());
        String slug = slugOf(name);
        if (catalogMapper.genreTaken(name, slug, null)) {
            throw new ApiException(ErrorCode.GENRE_NAME_TAKEN);
        }
        AdminGenre genre = new AdminGenre();
        genre.setName(name);
        genre.setSlug(slug);
        genre.setDescription(blankToNull(req.description()));
        genre.setSortOrder(req.sortOrder() == null ? 0 : req.sortOrder());
        try {
            catalogMapper.insertGenre(genre);
        } catch (DuplicateKeyException ex) {
            throw new ApiException(ErrorCode.GENRE_NAME_TAKEN);
        }
        evictGenres();
        return GenreAdminResponse.from(requireGenre(genre.getGenreId()));
    }

    /** G3: null = unchanged, empty description = cleared; the slug stays. */
    @Transactional
    public GenreAdminResponse updateGenre(int genreId, UpdateGenreRequest req) {
        AdminGenre current = requireGenre(genreId);
        if (!req.hasChanges()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Send at least one field to change.");
        }
        String name = req.name() == null ? null : normalizeName(req.name());
        if (name != null && catalogMapper.genreTaken(name, current.getSlug(), genreId)) {
            throw new ApiException(ErrorCode.GENRE_NAME_TAKEN);
        }
        try {
            catalogMapper.updateGenre(genreId, name, req.description() != null, blankToNull(req.description()),
                    req.sortOrder());
        } catch (DuplicateKeyException ex) {
            throw new ApiException(ErrorCode.GENRE_NAME_TAKEN);
        }
        evictGenres();
        return GenreAdminResponse.from(requireGenre(genreId));
    }

    /** G4 (D4). */
    @Transactional
    public void deleteGenre(int genreId) {
        AdminGenre genre = requireGenre(genreId);
        if (catalogMapper.genreInUse(genreId)) {
            throw new ApiException(ErrorCode.GENRE_IN_USE,
                    "The genre is still used by " + genre.getStoryCount() + " stories.");
        }
        catalogMapper.deleteGenre(genreId);
        evictGenres();
    }

    /* ---------- tags ---------- */

    /** T1. */
    @Transactional(readOnly = true)
    public PageResponse<TagResponse> tags(String q, Integer page, Integer size) {
        PageQuery pq = PageQuery.of(page, size);
        String like = AdminUserService.likePattern(q);
        long total = catalogMapper.countTags(like);
        List<TagResponse> items = total == 0 ? List.of()
                : catalogMapper.pageTags(like, pq.offset(), pq.size()).stream().map(TagResponse::from).toList();
        return PageResponse.of(items, pq.page(), pq.size(), total);
    }

    /** T2: normalised like story tags (TagService); the slug follows the new name. */
    @Transactional
    public TagResponse renameTag(int tagId, String rawName) {
        requireTag(tagId);
        String name = SPACES.matcher(rawName.strip()).replaceAll(" ");
        if (name.length() < TagService.NAME_MIN || name.length() > TagService.NAME_MAX) {
            throw ApiException.invalidField("name",
                    "must have " + TagService.NAME_MIN + "–" + TagService.NAME_MAX + " characters");
        }
        String slug = slugs.slugify(name, TagService.SLUG_MAX);
        if (slug.isEmpty()) {
            throw ApiException.invalidField("name", "must contain a letter or a digit");
        }
        if (catalogMapper.tagTaken(name, slug, tagId)) {
            throw new ApiException(ErrorCode.TAG_NAME_TAKEN);
        }
        try {
            catalogMapper.renameTag(tagId, name, slug);
        } catch (DuplicateKeyException ex) {
            throw new ApiException(ErrorCode.TAG_NAME_TAKEN);
        }
        evictStories(catalogMapper.storyIdsWithTag(tagId));
        return TagResponse.from(requireTag(tagId));
    }

    /** T3 (D5): StoryTag rows first, then the tag, in one transaction. */
    @Transactional
    public void deleteTag(int tagId) {
        requireTag(tagId);
        List<Integer> stories = catalogMapper.storyIdsWithTag(tagId);
        catalogMapper.deleteStoryTagsOfTag(tagId);
        catalogMapper.deleteTag(tagId);
        evictStories(stories);
    }

    /* ---------- helpers ---------- */

    private AdminGenre requireGenre(int genreId) {
        AdminGenre genre = catalogMapper.findGenre(genreId);
        if (genre == null) {
            throw new ApiException(ErrorCode.GENRE_NOT_FOUND);
        }
        return genre;
    }

    private Tag requireTag(int tagId) {
        Tag tag = catalogMapper.findTag(tagId);
        if (tag == null) {
            throw new ApiException(ErrorCode.TAG_NOT_FOUND);
        }
        return tag;
    }

    private String normalizeName(String raw) {
        return SPACES.matcher(raw.strip()).replaceAll(" ");
    }

    private String slugOf(String name) {
        String slug = slugs.slugify(name, SLUG_MAX);
        if (slug.isEmpty()) {
            throw ApiException.invalidField("name", "must contain a letter or a digit");
        }
        return slug;
    }

    private void evictGenres() {
        cache.evict(CacheKeys.GENRE_LIST, CacheKeys.HOME);
    }

    private void evictStories(List<Integer> storyIds) {
        if (storyIds.isEmpty()) {
            return;
        }
        List<String> keys = new ArrayList<>();
        for (int id : storyIds) {
            keys.add(CacheKeys.story(id));
        }
        cache.evict(keys.toArray(String[]::new));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
