package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import com.novelle.dto.PageResponse;
import com.novelle.dto.StoryCardResponse;
import com.novelle.dto.StorySearchRequest;
import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.mapper.StorySearchMapper;
import com.novelle.model.AuthorRef;
import com.novelle.model.StoryCard;
import com.novelle.model.StorySearchCriteria;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class StorySearchServiceTest {

    private StorySearchMapper mapper;
    private StorySearchService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StorySearchMapper.class);
        service = new StorySearchService(mapper);
    }

    /** Request with only the given fields set (q, genres, genreMode, tags, status, ageRating, min, max, rating, sort). */
    private static StorySearchRequest req(String q, List<String> genres, String genreMode, List<String> tags,
            String status, String ageRating, Integer min, Integer max, BigDecimal rating, String sort,
            Integer page, Integer size) {
        return new StorySearchRequest(q, genres, genreMode, tags, status, ageRating, min, max, rating, sort, page, size);
    }

    private static StorySearchRequest empty() {
        return req(null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private StorySearchCriteria captureCount() {
        ArgumentCaptor<StorySearchCriteria> captor = ArgumentCaptor.forClass(StorySearchCriteria.class);
        verify(mapper).count(captor.capture());
        return captor.getValue();
    }

    @Test
    void emptyRequestUsesDefaults() {
        service.search(empty());

        StorySearchCriteria c = captureCount();
        assertThat(c.getTerms()).isEmpty();
        assertThat(c.getOrderBy()).isEqualTo(StorySort.UPDATED.orderBy());
        assertThat(c.getOffset()).isZero();
        assertThat(c.getSize()).isEqualTo(PageQuery.DEFAULT_SIZE);
        assertThat(c.isGenreAny()).isFalse();
    }

    @Test
    void textSwitchesTheDefaultSortToRelevance() {
        service.search(req("Vĩnh Hằng", null, null, null, null, null, null, null, null, null, null, null));

        StorySearchCriteria c = captureCount();
        assertThat(c.getTerms()).containsExactly("\"vĩnh*\"", "\"hằng*\"");
        assertThat(c.getTermCount()).isEqualTo(2);
        assertThat(c.getOrderBy()).isEqualTo(StorySort.RELEVANCE.orderBy());
    }

    @Test
    void filtersAreNormalized() {
        service.search(req(null, List.of(" Tien-Hiep ", "tien-hiep", "", "kiem-hiep"), "ANY", List.of("hon-nhan"),
                "completed", "13+", 10, 30, new BigDecimal("4.5"), "views", 2, 10));

        StorySearchCriteria c = captureCount();
        assertThat(c.getGenreSlugs()).containsExactly("tien-hiep", "kiem-hiep");
        assertThat(c.getGenreCount()).isEqualTo(2);                     // duplicates must not inflate HAVING = n
        assertThat(c.isGenreAny()).isTrue();
        assertThat(c.getTagSlugs()).containsExactly("hon-nhan");
        assertThat(c.getCompletionStatus()).isEqualTo("COMPLETED");
        assertThat(c.getAgeRating()).isEqualTo("13+");
        assertThat(c.getMinChapters()).isEqualTo(10);
        assertThat(c.getMaxChapters()).isEqualTo(30);
        assertThat(c.getMinRating()).isEqualByComparingTo("4.5");
        assertThat(c.getOrderBy()).isEqualTo(StorySort.VIEWS.orderBy());
        assertThat(c.getOffset()).isEqualTo(20);
    }

    @Test
    void zeroTotalSkipsThePageQuery() {
        when(mapper.count(any())).thenReturn(0L);

        PageResponse<StoryCardResponse> page = service.search(empty());

        assertThat(page.items()).isEmpty();
        assertThat(page.totalPages()).isZero();
        verify(mapper, never()).search(any());
    }

    @Test
    void pageAfterTheEndSkipsThePageQueryButKeepsTheTotal() {
        when(mapper.count(any())).thenReturn(15L);

        PageResponse<StoryCardResponse> page =
                service.search(req(null, null, null, null, null, null, null, null, null, null, 3, 5));

        assertThat(page.items()).isEmpty();
        assertThat(page.totalElements()).isEqualTo(15);
        assertThat(page.totalPages()).isEqualTo(3);
        verify(mapper, never()).search(any());
    }

    @Test
    void rowsAreMappedToCards() {
        when(mapper.count(any())).thenReturn(1L);
        StoryCard card = new StoryCard();
        card.setStoryId(1);
        card.setTitle("Hoa Nở Dịu Dàng");
        AuthorRef author = new AuthorRef();
        author.setAuthorId(4);
        author.setPenName("Lăng Du");
        card.setAuthor(author);
        when(mapper.search(any())).thenReturn(List.of(card));

        PageResponse<StoryCardResponse> page = service.search(empty());

        assertThat(page.items()).singleElement().satisfies(s -> {
            assertThat(s.title()).isEqualTo("Hoa Nở Dịu Dàng");
            assertThat(s.author().penName()).isEqualTo("Lăng Du");
            assertThat(s.primaryGenre()).isNull();
        });
    }

    @Test
    void invalidParametersAre400OnTheirField() {
        assertField(req("!!!", null, null, null, null, null, null, null, null, null, null, null), "q");
        assertField(req("x".repeat(101), null, null, null, null, null, null, null, null, null, null, null), "q");
        assertField(req(null, null, null, null, null, null, null, null, null, "relevance", null, null), "sort");
        assertField(req(null, null, null, null, null, null, null, null, null, "abc", null, null), "sort");
        assertField(req(null, List.of("a", "b", "c", "d", "e", "f"), null, null, null, null, null, null, null,
                null, null, null), "genres");
        assertField(req(null, null, "both", null, null, null, null, null, null, null, null, null), "genreMode");
        assertField(req(null, null, null, Arrays.asList("1", "2", "3", "4", "5", "6"), null, null, null, null, null,
                null, null, null), "tags");
        assertField(req(null, null, null, null, "DONE", null, null, null, null, null, null, null), "status");
        assertField(req(null, null, null, null, null, "16+", null, null, null, null, null, null), "ageRating");
        assertField(req(null, null, null, null, null, null, -1, null, null, null, null, null), "minChapters");
        assertField(req(null, null, null, null, null, null, 30, 10, null, null, null, null), "maxChapters");
        assertField(req(null, null, null, null, null, null, null, null, new BigDecimal("5.01"), null, null, null),
                "minRating");
        assertField(req(null, null, null, null, null, null, null, null, null, null, null, 51), "size");
        verify(mapper, never()).count(any());
    }

    @Test
    void sixSlugsWithDuplicatesAreAccepted() {
        service.search(req(null, List.of("a", "a", "b", "c", "d", "e"), null, null, null, null, null, null, null,
                null, null, null));
        assertThat(captureCount().getGenreCount()).isEqualTo(5);
    }

    @Test
    void listByAuthorFiltersOnTheAuthorAndRejectsRelevance() {
        service.listByAuthor(4, "views", 0, 5);
        StorySearchCriteria c = captureCount();
        assertThat(c.getAuthorId()).isEqualTo(4);
        assertThat(c.getTerms()).isEmpty();
        assertThat(c.getOrderBy()).isEqualTo(StorySort.VIEWS.orderBy());

        assertThatThrownBy(() -> service.listByAuthor(4, "relevance", 0, 5))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
    }

    private void assertField(StorySearchRequest request, String field) {
        assertThatThrownBy(() -> service.search(request)).isInstanceOfSatisfying(ApiException.class, ex -> {
            assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
            assertThat((List<?>) ex.details()).singleElement()
                    .extracting(e -> ((ApiError.FieldError) e).field()).isEqualTo(field);
        });
    }
}
