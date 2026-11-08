package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.function.Supplier;

import com.fasterxml.jackson.core.type.TypeReference;
import com.novelle.config.CatalogProperties;
import com.novelle.dto.HomeResponse;
import com.novelle.dto.StoryDetailResponse;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.cache.CacheTtlProperties;
import com.novelle.mapper.AuthorMapper;
import com.novelle.mapper.CatalogMapper;
import com.novelle.mapper.StoryMapper;
import com.novelle.model.AuthorProfile;
import com.novelle.model.AuthorRef;
import com.novelle.model.ChapterToc;
import com.novelle.model.Genre;
import com.novelle.model.GenreRef;
import com.novelle.model.StoryDetail;
import com.novelle.model.VolumeToc;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** CatalogService, HomeService, StoryService and AuthorService with mocked mappers and a pass-through cache. */
class CatalogServicesTest {

    private static final CacheTtlProperties TTL =
            new CacheTtlProperties(Duration.ofHours(1), Duration.ofMinutes(2), Duration.ofMinutes(10),
                    Duration.ofMinutes(30));

    private CacheService cache;
    private CatalogMapper catalogMapper;
    private StoryMapper storyMapper;
    private AuthorMapper authorMapper;
    private StorySearchService searchService;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        cache = mock(CacheService.class);
        // a cache miss every time: run the loader
        when(cache.getOrLoad(anyString(), any(Duration.class), any(Class.class), any(Supplier.class)))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(3)).get());
        when(cache.getOrLoad(anyString(), any(Duration.class), any(TypeReference.class), any(Supplier.class)))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(3)).get());
        catalogMapper = mock(CatalogMapper.class);
        storyMapper = mock(StoryMapper.class);
        authorMapper = mock(AuthorMapper.class);
        searchService = mock(StorySearchService.class);
    }

    /* ---------- CatalogService ---------- */

    @Test
    @SuppressWarnings("unchecked")
    void genresGoThroughTheGenreCacheKey() {
        Genre g = new Genre();
        g.setGenreId(1);
        g.setName("Tiên hiệp");
        g.setStoryCount(19);
        when(catalogMapper.findGenresWithCount()).thenReturn(List.of(g));

        assertThat(new CatalogService(catalogMapper, cache, TTL).getGenres())
                .singleElement().satisfies(r -> assertThat(r.storyCount()).isEqualTo(19));
        verify(cache).getOrLoad(eq(CacheKeys.GENRE_LIST), eq(Duration.ofHours(1)), any(TypeReference.class),
                any(Supplier.class));
    }

    @Test
    void tagPrefixesAreEscapedAndTheSlugPrefixHasDashes() {
        new CatalogService(catalogMapper, cache, TTL).findTags("  Hôn nhân_100% ", 5);
        verify(catalogMapper).findTags("Hôn nhân\\_100\\%%", "hôn-nhân\\_100\\%%", 5);
    }

    @Test
    void blankTagQueryMeansNoFilterAndDefaultLimit() {
        new CatalogService(catalogMapper, cache, TTL).findTags("  ", null);
        verify(catalogMapper).findTags(null, null, CatalogService.DEFAULT_TAG_LIMIT);
    }

    @Test
    void tagParametersAreValidated() {
        CatalogService service = new CatalogService(catalogMapper, cache, TTL);
        assertCode(() -> service.findTags(null, 0), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.findTags(null, 51), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.findTags("x".repeat(51), 5), ErrorCode.VALIDATION_FAILED);
        verify(catalogMapper, never()).findTags(any(), any(), anyInt());
    }

    @Test
    void escapeLikeCoversEverySpecialCharacter() {
        assertThat(CatalogService.escapeLike("a\\b%c_d[e]")).isEqualTo("a\\\\b\\%c\\_d\\[e]");
    }

    /* ---------- HomeService ---------- */

    @Test
    void homeLoadsFiveBlocksWithTheirOwnRules() {
        HomeService service = new HomeService(catalogMapper, cache, TTL, new CatalogProperties(12, 10));
        when(catalogMapper.findHomeBlock(anyString(), anyBoolean(), any(), anyInt())).thenReturn(List.of());

        HomeResponse home = service.getHome();

        assertThat(home.latestUpdated()).isEmpty();
        verify(catalogMapper).findHomeBlock(StorySort.UPDATED.orderBy(), false, null, 12);
        verify(catalogMapper).findHomeBlock(StorySort.NEWEST.orderBy(), false, null, 12);
        verify(catalogMapper).findHomeBlock(StorySort.RATING.orderBy(), false, 10, 12);
        verify(catalogMapper).findHomeBlock(StorySort.VIEWS.orderBy(), false, null, 12);
        verify(catalogMapper).findHomeBlock(StorySort.UPDATED.orderBy(), true, null, 12);
        verify(cache).getOrLoad(eq(CacheKeys.HOME), eq(Duration.ofMinutes(2)), eq(HomeResponse.class),
                any(Supplier.class));
    }

    /* ---------- StoryService ---------- */

    @Test
    void unknownSlugIs404WithoutTouchingTheCache() {
        StoryService service = new StoryService(storyMapper, cache, TTL);
        when(storyMapper.findPublicIdBySlug("khong-co")).thenReturn(null);   // Mockito's default for Integer is 0
        assertCode(() -> service.getDetail("khong-co"), ErrorCode.STORY_NOT_FOUND);
        verify(storyMapper, never()).findDetail(anyInt());
    }

    @Test
    void detailIsAssembledAndCachedById() {
        when(storyMapper.findPublicIdBySlug("hoa-no")).thenReturn(1);
        StoryDetail detail = new StoryDetail();
        detail.setStoryId(1);
        detail.setTitle("Hoa Nở");
        detail.setRatingAvg(new BigDecimal("4.27"));
        AuthorRef author = new AuthorRef();
        author.setIsVerified(true);
        detail.setAuthor(author);
        when(storyMapper.findDetail(1)).thenReturn(detail);
        GenreRef primary = genre(4, true);
        when(storyMapper.findGenres(1)).thenReturn(List.of(primary, genre(3, false)));
        VolumeToc volume = new VolumeToc();
        volume.setVolumeNo(1);
        volume.setChapters(List.of(chapter(1)));
        when(storyMapper.findVolumesWithChapters(1)).thenReturn(List.of(volume));
        when(storyMapper.findLooseChapters(1)).thenReturn(List.of(chapter(9)));

        StoryDetailResponse r = new StoryService(storyMapper, cache, TTL).getDetail("hoa-no");

        assertThat(r.author().isVerified()).isTrue();
        assertThat(r.genres()).extracting(StoryDetailResponse.Genre::genreId).containsExactly(4, 3);
        assertThat(r.genres().get(0).isPrimary()).isTrue();
        assertThat(r.volumes()).singleElement().satisfies(v -> assertThat(v.chapters()).hasSize(1));
        assertThat(r.looseChapters()).singleElement().satisfies(c -> {
            assertThat(c.chapterNo()).isEqualTo(9);
            assertThat(c.publishedAt()).hasToString("2026-01-02T19:30:02Z");
        });
        assertThat(r.tags()).isEmpty();
        verify(cache).getOrLoad(eq(CacheKeys.story(1)), eq(Duration.ofMinutes(10)), eq(StoryDetailResponse.class),
                any(Supplier.class));
    }

    @Test
    void storyHiddenBetweenTheTwoReadsIs404() {
        when(storyMapper.findPublicIdBySlug("hoa-no")).thenReturn(1);
        when(storyMapper.findDetail(1)).thenReturn(null);
        assertCode(() -> new StoryService(storyMapper, cache, TTL).getDetail("hoa-no"), ErrorCode.STORY_NOT_FOUND);
        verify(storyMapper, never()).findGenres(anyInt());
    }

    /* ---------- AuthorService ---------- */

    @Test
    void unknownAuthorIs404() {
        AuthorService service = new AuthorService(authorMapper, searchService);
        assertCode(() -> service.getProfile(9), ErrorCode.AUTHOR_NOT_FOUND);
        assertCode(() -> service.getStories(9, null, null, null), ErrorCode.AUTHOR_NOT_FOUND);
        verify(searchService, never()).listByAuthor(anyInt(), any(), any(), any());
    }

    @Test
    void profileCarriesTheStatistics() {
        AuthorProfile p = new AuthorProfile();
        p.setAuthorId(4);
        p.setPenName("Lăng Du");
        p.setStoryCount(20);
        p.setChapterCount(465);
        p.setRatingAvg(new BigDecimal("4.23"));
        when(authorMapper.findPublicProfile(4)).thenReturn(p);

        var r = new AuthorService(authorMapper, searchService).getProfile(4);

        assertThat(r.stats().storyCount()).isEqualTo(20);
        assertThat(r.stats().chapterCount()).isEqualTo(465);
        assertThat(r.stats().ratingAvg()).isEqualByComparingTo("4.23");
    }

    @Test
    void storiesOfAnExistingAuthorAreDelegated() {
        when(authorMapper.existsAuthor(4)).thenReturn(true);
        new AuthorService(authorMapper, searchService).getStories(4, "views", 1, 5);
        verify(searchService).listByAuthor(4, "views", 1, 5);
    }

    /* ---------- helpers ---------- */

    private static GenreRef genre(int id, boolean primary) {
        GenreRef g = new GenreRef();
        g.setGenreId(id);
        g.setIsPrimary(primary);
        return g;
    }

    private static ChapterToc chapter(int no) {
        ChapterToc c = new ChapterToc();
        c.setChapterId(no);
        c.setChapterNo(no);
        c.setPublishedAt(LocalDateTime.of(2026, 1, 2, 19, 30, 2));
        return c;
    }

    private static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(code));
    }
}
