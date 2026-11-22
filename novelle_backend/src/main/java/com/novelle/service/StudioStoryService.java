package com.novelle.service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import com.novelle.dto.CreateStoryRequest;
import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryGenresRequest;
import com.novelle.dto.StudioStoryCardResponse;
import com.novelle.dto.StudioStoryResponse;
import com.novelle.dto.UpdateStoryRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.StoryMapper;
import com.novelle.mapper.StudioStoryMapper;
import com.novelle.model.StudioStory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * My stories in the studio (F8, docs/module-studio.md S1–S9).
 * <ul>
 *   <li>Ownership: {@link StudioOwnership} (404 when not mine).</li>
 *   <li>Edits use {@code UpdatedAt} as optimistic lock (D4); genres / tags changes also move it ({@code touch}).</li>
 *   <li>Publishing needs a published chapter (D1); a story HIDDEN by an administrator keeps its status (D5).</li>
 *   <li>Every write evicts {@code cache:story:{id}}; status changes and deletion also evict {@code cache:home}.</li>
 * </ul>
 */
@Service
public class StudioStoryService {

    /** Story.Slug is VARCHAR(350). */
    static final int SLUG_MAX = 350;
    static final String SLUG_FALLBACK = "truyen";
    static final int MAX_GENRES = 3;

    private static final String SLUG_CONSTRAINT = "UQ_Story_Slug";
    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED", "HIDDEN");

    private final StudioStoryMapper storyMapper;
    private final StoryMapper publicStoryMapper;
    private final StudioOwnership ownership;
    private final TagService tagService;
    private final SlugGenerator slugs;
    private final CacheService cache;

    public StudioStoryService(StudioStoryMapper storyMapper, StoryMapper publicStoryMapper,
                              StudioOwnership ownership, TagService tagService, SlugGenerator slugs,
                              CacheService cache) {
        this.storyMapper = storyMapper;
        this.publicStoryMapper = publicStoryMapper;
        this.ownership = ownership;
        this.tagService = tagService;
        this.slugs = slugs;
        this.cache = cache;
    }

    /* ---------- reading ---------- */

    /** S1. {@code status} null = every status; case insensitive. */
    @Transactional(readOnly = true)
    public PageResponse<StudioStoryCardResponse> page(int authorId, String status, Integer page, Integer size) {
        PageQuery q = PageQuery.of(page, size);
        String filter = parseStatus(status);
        long total = storyMapper.countMine(authorId, filter);
        List<StudioStoryCardResponse> items = total == 0 ? List.of()
                : storyMapper.pageMine(authorId, filter, q.offset(), q.size()).stream()
                        .map(StudioStoryCardResponse::from).toList();
        return PageResponse.of(items, q.page(), q.size(), total);
    }

    /** S3. */
    @Transactional(readOnly = true)
    public StudioStoryResponse get(int authorId, int storyId) {
        return response(ownership.story(storyId, authorId));
    }

    /* ---------- writing ---------- */

    /**
     * S2. Every check runs before the first write. Story, genres and tags go in one transaction, because
     * 99_check_invariants also checks RB6 on drafts.
     */
    @Transactional
    public StudioStoryResponse create(int authorId, CreateStoryRequest req) {
        List<Integer> genreIds = validateGenres(req.genreIds(), req.primaryGenreId());
        List<TagService.TagInput> tags = tagService.normalize(req.tags());

        StudioStory story = new StudioStory();
        story.setAuthorId(authorId);
        story.setTitle(req.title().strip());
        story.setDescription(blankToNull(req.description()));
        story.setCoverUrl(blankToNull(req.coverUrl()));
        story.setAgeRating(req.ageRating());
        story.setCompletionStatus(req.completionStatus());
        insertWithSlug(story);

        storyMapper.insertGenres(story.getStoryId(), genreIds, req.primaryGenreId());
        tagService.replaceStoryTags(story.getStoryId(), tags);
        return response(ownership.story(story.getStoryId(), authorId));
    }

    /** S4. The slug is kept when the title changes (old links keep working). */
    @Transactional
    public StudioStoryResponse update(int authorId, int storyId, UpdateStoryRequest req) {
        StudioStory story = ownership.story(storyId, authorId);
        if (!req.hasChanges()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "Send at least one field to change.");
        }
        int rows = storyMapper.updateMeta(storyId, authorId,
                req.title() == null ? null : req.title().strip(),
                req.description() != null, blankToNull(req.description()),
                req.coverUrl() != null, blankToNull(req.coverUrl()),
                req.ageRating(), req.completionStatus(), toDb(req.version()));
        if (rows == 0) {
            throw new ApiException(ErrorCode.STALE_DATA);
        }
        evict(story, false);
        return response(ownership.story(storyId, authorId));
    }

    /** S5 (RB6). */
    @Transactional
    public StudioStoryResponse replaceGenres(int authorId, int storyId, StoryGenresRequest req) {
        StudioStory story = ownership.story(storyId, authorId);
        List<Integer> genreIds = validateGenres(req.genreIds(), req.primaryGenreId());
        storyMapper.deleteGenres(storyId);
        storyMapper.insertGenres(storyId, genreIds, req.primaryGenreId());
        storyMapper.touch(storyId);
        evict(story, false);
        return response(ownership.story(storyId, authorId));
    }

    /** S6 (RB6, UsageCount kept by {@link TagService}). */
    @Transactional
    public StudioStoryResponse replaceTags(int authorId, int storyId, List<String> names) {
        StudioStory story = ownership.story(storyId, authorId);
        tagService.replaceStoryTags(storyId, tagService.normalize(names));
        storyMapper.touch(storyId);
        evict(story, false);
        return response(ownership.story(storyId, authorId));
    }

    /**
     * S7. The UPDATE carries its preconditions (DRAFT and ChapterCount > 0), so two concurrent calls cannot both
     * succeed; when it changes nothing the row is read again to tell the author why.
     */
    @Transactional
    public StudioStoryResponse publish(int authorId, int storyId) {
        ownership.story(storyId, authorId);
        if (storyMapper.publish(storyId, authorId) == 0) {
            StudioStory now = ownership.story(storyId, authorId);
            throw switch (now.getPublishStatus()) {
                case "HIDDEN" -> new ApiException(ErrorCode.STORY_HIDDEN);
                case "PUBLISHED" -> new ApiException(ErrorCode.ALREADY_PROCESSED, "The story is already published.");
                default -> now.getChapterCount() == 0
                        ? new ApiException(ErrorCode.STORY_HAS_NO_CHAPTER)
                        : new ApiException(ErrorCode.CONFLICT);
            };
        }
        StudioStory story = ownership.story(storyId, authorId);
        evict(story, true);
        return response(story);
    }

    /** S8. A HIDDEN story keeps its status: only an administrator can change it (D5, RB8). */
    @Transactional
    public StudioStoryResponse unpublish(int authorId, int storyId) {
        ownership.story(storyId, authorId);
        if (storyMapper.unpublish(storyId, authorId) == 0) {
            StudioStory now = ownership.story(storyId, authorId);
            throw "HIDDEN".equals(now.getPublishStatus())
                    ? new ApiException(ErrorCode.STORY_HIDDEN)
                    : new ApiException(ErrorCode.ALREADY_PROCESSED, "The story is not published.");
        }
        StudioStory story = ownership.story(storyId, authorId);
        evict(story, true);
        return response(story);
    }

    /**
     * S9. Not {@code @Transactional}: sp_DeleteStory opens and ends its own transaction. The ownership read
     * first gives the 404; the procedure checks ownership again (50002 / 50004).
     */
    public void delete(int authorId, int storyId) {
        StudioStory story = ownership.story(storyId, authorId);
        storyMapper.deleteStory(storyId, authorId);
        evict(story, true);
    }

    /* ---------- helpers ---------- */

    /**
     * RB6: 1–3 distinct genres that exist, the primary one among them. The DTO already bounds the list size; this
     * repeats it because the service is also called directly.
     */
    List<Integer> validateGenres(List<Integer> genreIds, Integer primaryGenreId) {
        if (genreIds == null || genreIds.isEmpty() || genreIds.size() > MAX_GENRES) {
            throw ApiException.invalidField("genreIds", "choose 1 to " + MAX_GENRES + " genres");
        }
        Set<Integer> distinct = new LinkedHashSet<>(genreIds);
        if (distinct.size() != genreIds.size() || distinct.contains(null)) {
            throw ApiException.invalidField("genreIds", "genres must be distinct");
        }
        if (primaryGenreId == null || !distinct.contains(primaryGenreId)) {
            throw ApiException.invalidField("primaryGenreId", "the primary genre must be one of the chosen genres");
        }
        List<Integer> ids = List.copyOf(distinct);
        if (storyMapper.countGenres(ids) != ids.size()) {
            throw ApiException.invalidField("genreIds", "unknown genre");
        }
        return ids;
    }

    /**
     * Slug from the title (FR-M6-03): the first free one of {@code base}, {@code base-2}, {@code base-3}… A
     * concurrent insert of the same slug fails on UQ_Story_Slug; the slug is then chosen again once.
     */
    private void insertWithSlug(StudioStory story) {
        story.setSlug(freeSlug(story.getTitle()));
        try {
            storyMapper.insert(story);
        } catch (DuplicateKeyException ex) {
            if (!isSlugConflict(ex)) {
                throw ex;
            }
            story.setSlug(freeSlug(story.getTitle()));
            storyMapper.insert(story);
        }
    }

    String freeSlug(String title) {
        String base = slugs.slugify(title, SLUG_MAX);
        if (base.isEmpty()) {
            base = SLUG_FALLBACK;
        }
        Set<String> taken = new HashSet<>(storyMapper.slugsLike(base, base + "-%"));
        if (!taken.contains(base)) {
            return base;
        }
        for (int n = 2; ; n++) {
            String candidate = slugs.withSuffix(base, n, SLUG_MAX);
            if (!taken.contains(candidate)) {
                return candidate;
            }
        }
    }

    private static boolean isSlugConflict(DuplicateKeyException ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t.getMessage() != null && t.getMessage().contains(SLUG_CONSTRAINT)) {
                return true;
            }
        }
        return false;
    }

    private StudioStoryResponse response(StudioStory story) {
        return StudioStoryResponse.from(story, publicStoryMapper.findGenres(story.getStoryId()),
                publicStoryMapper.findTags(story.getStoryId()));
    }

    /** The public page shows the story only when PUBLISHED, but evicting a key that is absent is harmless. */
    private void evict(StudioStory story, boolean homeToo) {
        if (homeToo || "PUBLISHED".equals(story.getPublishStatus())) {
            cache.evict(CacheKeys.story(story.getStoryId()), CacheKeys.HOME);
        } else {
            cache.evict(CacheKeys.story(story.getStoryId()));
        }
    }

    private static String parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String s = status.strip().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(s)) {
            throw ApiException.invalidField("status", "must be DRAFT, PUBLISHED or HIDDEN");
        }
        return s;
    }

    /** API versions are instants; DATETIME2 columns hold UTC without offset. */
    static LocalDateTime toDb(Instant version) {
        return LocalDateTime.ofInstant(version, ZoneOffset.UTC);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
