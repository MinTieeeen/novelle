package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import com.novelle.dto.CreateGenreRequest;
import com.novelle.dto.UpdateGenreRequest;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.AdminCatalogMapper;
import com.novelle.model.AdminGenre;
import com.novelle.model.Tag;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.dao.DuplicateKeyException;

class AdminCatalogServiceTest {

    private AdminCatalogMapper mapper;
    private CacheService cache;
    private AdminCatalogService service;

    @BeforeEach
    void setUp() {
        mapper = mock(AdminCatalogMapper.class);
        cache = mock(CacheService.class);
        service = new AdminCatalogService(mapper, new SlugGenerator(), cache);
        AdminGenre g = new AdminGenre();
        g.setGenreId(30);
        g.setSlug("huyen-huyen");
        g.setStoryCount(4);
        when(mapper.findGenre(anyInt())).thenReturn(g);
        Tag t = new Tag();
        t.setTagId(9);
        when(mapper.findTag(9)).thenReturn(t);
        when(mapper.storyIdsWithTag(9)).thenReturn(List.of(1, 2));
    }

    private static void assertCode(ThrowingCallable call, ErrorCode code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.code()).isEqualTo(code));
    }

    /* ---------- genres (D4) ---------- */

    @Test
    void createGenreMakesTheSlugAndEvicts() {
        service.createGenre(new CreateGenreRequest("  Huyền   huyễn ", " ", null));

        ArgumentCaptor<AdminGenre> g = ArgumentCaptor.forClass(AdminGenre.class);
        verify(mapper).insertGenre(g.capture());
        assertThat(g.getValue().getName()).isEqualTo("Huyền huyễn");
        assertThat(g.getValue().getSlug()).isEqualTo("huyen-huyen");
        assertThat(g.getValue().getDescription()).isNull();
        assertThat(g.getValue().getSortOrder()).isZero();
        verify(cache).evict("cache:genre:list", "cache:home");
    }

    @Test
    void takenGenreNameIs409() {
        when(mapper.genreTaken(anyString(), anyString(), any())).thenReturn(true);
        assertCode(() -> service.createGenre(new CreateGenreRequest("Tiên hiệp", null, 1)), ErrorCode.GENRE_NAME_TAKEN);
        verify(mapper, never()).insertGenre(any());

        when(mapper.genreTaken(anyString(), anyString(), any())).thenReturn(false);
        when(mapper.insertGenre(any())).thenThrow(new DuplicateKeyException("UQ_Genre_Name"));
        assertCode(() -> service.createGenre(new CreateGenreRequest("Tiên hiệp", null, 1)), ErrorCode.GENRE_NAME_TAKEN);
    }

    @Test
    void genreNameWithoutLetterIsRejected() {
        assertCode(() -> service.createGenre(new CreateGenreRequest("!!!", null, null)), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void renamingAGenreKeepsItsSlug() {
        service.updateGenre(30, new UpdateGenreRequest("Huyễn tưởng", "", 5));
        verify(mapper).genreTaken("Huyễn tưởng", "huyen-huyen", 30);
        verify(mapper).updateGenre(30, "Huyễn tưởng", true, null, 5);
        assertCode(() -> service.updateGenre(30, new UpdateGenreRequest(null, null, null)), ErrorCode.VALIDATION_FAILED);
    }

    @Test
    void genreInUseIsNotDeleted() {
        when(mapper.genreInUse(30)).thenReturn(true);
        assertCode(() -> service.deleteGenre(30), ErrorCode.GENRE_IN_USE);
        verify(mapper, never()).deleteGenre(anyInt());

        when(mapper.genreInUse(30)).thenReturn(false);
        service.deleteGenre(30);
        verify(mapper).deleteGenre(30);
    }

    /* ---------- tags (D5) ---------- */

    @Test
    void deleteTagRemovesItsStoryTagsFirstAndEvictsTheStories() {
        service.deleteTag(9);

        InOrder order = inOrder(mapper);
        order.verify(mapper).deleteStoryTagsOfTag(9);
        order.verify(mapper).deleteTag(9);
        verify(cache).evict("cache:story:1", "cache:story:2");
    }

    @Test
    void renameTagNormalisesAndChecksClashes() {
        service.renameTag(9, "  Trùng   sinh ");
        verify(mapper).renameTag(9, "Trùng sinh", "trung-sinh");

        when(mapper.tagTaken(anyString(), anyString(), eq(9))).thenReturn(true);
        assertCode(() -> service.renameTag(9, "Hệ thống"), ErrorCode.TAG_NAME_TAKEN);
        assertCode(() -> service.renameTag(9, "a"), ErrorCode.VALIDATION_FAILED);
        assertCode(() -> service.renameTag(404, "Hệ thống"), ErrorCode.TAG_NOT_FOUND);
    }

    @Test
    void missingGenreIs404() {
        when(mapper.findGenre(99)).thenReturn(null);
        assertCode(() -> service.deleteGenre(99), ErrorCode.GENRE_NOT_FOUND);
        verify(mapper, never()).genreInUse(anyInt());
        verify(mapper, never()).updateGenre(anyInt(), any(), anyBoolean(), any(), any());
    }
}
