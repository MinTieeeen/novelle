package com.novelle.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.dto.StorySearchRequest;
import com.novelle.exception.ApiException;
import com.novelle.mapper.StorySearchMapper;
import com.novelle.model.StorySearchCriteria;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Story lists over vw_PublicStory (F2 search, an author's stories): validates the parameters, builds a
 * {@link StorySearchCriteria}, counts, then reads one page. Not cached (too many parameter combinations).
 */
@Service
public class StorySearchService {

    static final int MAX_SLUGS = 5;
    static final int MAX_QUERY_LENGTH = 100;

    private static final Set<String> COMPLETION_STATUSES = Set.of("ONGOING", "COMPLETED", "HIATUS");
    private static final Set<String> AGE_RATINGS = Set.of("ALL", "13+", "18+");
    private static final BigDecimal FIVE = BigDecimal.valueOf(5);

    private final StorySearchMapper searchMapper;

    public StorySearchService(StorySearchMapper searchMapper) {
        this.searchMapper = searchMapper;
    }

    /** GET /api/stories. */
    @Transactional(readOnly = true)
    public PageResponse<StoryCardResponse> search(StorySearchRequest req) {
        StorySearchCriteria c = new StorySearchCriteria();

        List<String> terms = List.of();
        if (req.q() != null && !req.q().isBlank()) {
            if (req.q().length() > MAX_QUERY_LENGTH) {
                throw ApiException.invalidField("q", "size must be between 0 and " + MAX_QUERY_LENGTH);
            }
            terms = SearchQueryNormalizer.toTerms(req.q());
            if (terms.isEmpty()) {
                throw ApiException.invalidField("q", "must contain at least one letter or digit");
            }
        }
        c.setTerms(terms);
        StorySort sort = StorySort.resolve(req.sort(), !terms.isEmpty());

        c.setGenreSlugs(slugs(req.genres(), "genres"));
        c.setGenreAny(genreAny(req.genreMode()));
        c.setTagSlugs(slugs(req.tags(), "tags"));
        c.setCompletionStatus(oneOf(req.status(), "status", COMPLETION_STATUSES));
        c.setAgeRating(oneOf(req.ageRating(), "ageRating", AGE_RATINGS));

        if (req.minChapters() != null && req.minChapters() < 0) {
            throw ApiException.invalidField("minChapters", "must be greater than or equal to 0");
        }
        if (req.maxChapters() != null && req.maxChapters() < 0) {
            throw ApiException.invalidField("maxChapters", "must be greater than or equal to 0");
        }
        if (req.minChapters() != null && req.maxChapters() != null && req.minChapters() > req.maxChapters()) {
            throw ApiException.invalidField("maxChapters", "must be greater than or equal to minChapters");
        }
        c.setMinChapters(req.minChapters());
        c.setMaxChapters(req.maxChapters());

        if (req.minRating() != null && (req.minRating().signum() < 0 || req.minRating().compareTo(FIVE) > 0)) {
            throw ApiException.invalidField("minRating", "must be between 0 and 5");
        }
        c.setMinRating(req.minRating());

        return run(c, sort, PageQuery.of(req.page(), req.size()));
    }

    /** Public stories of one author (GET /api/authors/{id}/stories); {@code relevance} is rejected (no text). */
    @Transactional(readOnly = true)
    public PageResponse<StoryCardResponse> listByAuthor(int authorId, String sort, Integer page, Integer size) {
        StorySort resolved = StorySort.resolve(sort, false);
        PageQuery paging = PageQuery.of(page, size);
        StorySearchCriteria c = new StorySearchCriteria();
        c.setAuthorId(authorId);
        return run(c, resolved, paging);
    }

    private PageResponse<StoryCardResponse> run(StorySearchCriteria c, StorySort sort, PageQuery paging) {
        c.setOrderBy(sort.orderBy());
        c.setOffset(paging.offset());
        c.setSize(paging.size());

        long total = searchMapper.count(c);
        if (total == 0 || paging.offset() >= total) {
            return PageResponse.of(List.of(), paging.page(), paging.size(), total);
        }
        List<StoryCardResponse> items = searchMapper.search(c).stream().map(StoryCardResponse::from).toList();
        return PageResponse.of(items, paging.page(), paging.size(), total);
    }

    /**
     * Trimmed, lower-cased, de-duplicated slugs (so that "all genres" compares with the right count);
     * at most {@value #MAX_SLUGS}. Unknown slugs are not an error: they simply match nothing.
     */
    static List<String> slugs(List<String> raw, String field) {
        if (raw == null) {
            return List.of();
        }
        List<String> result = raw.stream()
                .filter(Objects::nonNull)
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .distinct()
                .toList();
        if (result.size() > MAX_SLUGS) {
            throw ApiException.invalidField(field, "at most " + MAX_SLUGS + " values");
        }
        return result;
    }

    static boolean genreAny(String mode) {
        if (mode == null || mode.isBlank() || mode.trim().equalsIgnoreCase("all")) {
            return false;
        }
        if (mode.trim().equalsIgnoreCase("any")) {
            return true;
        }
        throw ApiException.invalidField("genreMode", "must be one of all, any");
    }

    /** Upper-cased value when it is in {@code allowed}, null when blank, otherwise 400 on {@code field}. */
    static String oneOf(String value, String field, Set<String> allowed) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String upper = value.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(upper)) {
            throw ApiException.invalidField(field, "must be one of " + String.join(", ", allowed.stream().sorted().toList()));
        }
        return upper;
    }
}
