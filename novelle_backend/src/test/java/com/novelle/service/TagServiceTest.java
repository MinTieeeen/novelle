package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.TagMapper;
import com.novelle.model.Tag;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class TagServiceTest {

    private static final int STORY = 7;

    private TagMapper mapper;
    private TagService service;

    @BeforeEach
    void setUp() {
        mapper = mock(TagMapper.class);
        service = new TagService(mapper, new SlugGenerator());
        when(mapper.findBySlugs(anyList())).thenReturn(List.of());
        when(mapper.findStoryTagIds(anyInt())).thenReturn(List.of());
    }

    private static Tag tag(int id, String name, String slug) {
        Tag t = new Tag();
        t.setTagId(id);
        t.setName(name);
        t.setSlug(slug);
        return t;
    }

    private static void assertInvalid(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                ex -> assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
    }

    /* ---------- normalize ---------- */

    @Test
    void normalizeTrimsCollapsesAndMergesBySlug() {
        List<TagService.TagInput> tags = service.normalize(List.of("  Hệ   thống ", "he thong", "Nữ cường"));
        assertThat(tags).containsExactly(new TagService.TagInput("Hệ thống", "he-thong"),
                new TagService.TagInput("Nữ cường", "nu-cuong"));
    }

    @Test
    void nullListMeansNoTag() {
        assertThat(service.normalize(null)).isEmpty();
    }

    @Test
    void tenTagsAreAllowedElevenAreNot() {
        List<String> ten = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            ten.add("Tag " + i);
        }
        assertThat(service.normalize(ten)).hasSize(10);
        ten.add("Tag 11");
        assertInvalid(() -> service.normalize(ten));
    }

    @Test
    void duplicatesDoNotCountTowardsTheLimit() {
        List<String> names = new ArrayList<>(Collections.nCopies(15, "Xuyên không"));
        assertThat(service.normalize(names)).hasSize(1);
    }

    @Test
    void tooShortTooLongBlankOrSymbolOnlyTagsAreRejected() {
        assertInvalid(() -> service.normalize(List.of("a")));
        assertInvalid(() -> service.normalize(List.of("x".repeat(51))));
        assertInvalid(() -> service.normalize(Collections.singletonList(null)));
        assertInvalid(() -> service.normalize(List.of("!!!")));
    }

    /* ---------- replaceStoryTags ---------- */

    @Test
    void addsAndRemovesOnlyTheDifferenceAndAdjustsUsage() {
        when(mapper.findBySlugs(anyList())).thenReturn(List.of(tag(1, "Hệ thống", "he-thong"), tag(2, "Nữ cường", "nu-cuong")));
        when(mapper.findStoryTagIds(STORY)).thenReturn(List.of(2, 3));

        service.replaceStoryTags(STORY, service.normalize(List.of("Hệ thống", "Nữ cường")));

        verify(mapper).deleteStoryTags(STORY, List.of(3));
        verify(mapper).adjustUsage(List.of(3), -1);
        verify(mapper).insertStoryTags(STORY, List.of(1));
        verify(mapper).adjustUsage(List.of(1), 1);
    }

    @Test
    void sameTagsChangeNothing() {
        when(mapper.findBySlugs(anyList())).thenReturn(List.of(tag(1, "Hệ thống", "he-thong")));
        when(mapper.findStoryTagIds(STORY)).thenReturn(List.of(1));

        service.replaceStoryTags(STORY, service.normalize(List.of("Hệ thống")));

        verify(mapper, never()).insertStoryTags(anyInt(), anyList());
        verify(mapper, never()).deleteStoryTags(anyInt(), anyList());
        verify(mapper, never()).adjustUsage(anyList(), anyInt());
    }

    @Test
    void emptyListRemovesEveryTag() {
        when(mapper.findStoryTagIds(STORY)).thenReturn(List.of(4, 5));

        service.replaceStoryTags(STORY, List.of());

        verify(mapper, never()).findBySlugs(anyList());
        verify(mapper).deleteStoryTags(STORY, List.of(4, 5));
        verify(mapper).adjustUsage(List.of(4, 5), -1);
    }

    @Test
    void unknownTagIsCreated() {
        doAnswer(inv -> {
            inv.<Tag>getArgument(0).setTagId(42);
            return 1;
        }).when(mapper).insert(any(Tag.class));

        service.replaceStoryTags(STORY, service.normalize(List.of("Trọng sinh")));

        verify(mapper).insert(any(Tag.class));
        verify(mapper).insertStoryTags(STORY, List.of(42));
        verify(mapper).adjustUsage(List.of(42), 1);
    }

    @Test
    void tagCreatedConcurrentlyIsReadAgain() {
        when(mapper.insert(any(Tag.class))).thenThrow(new DuplicateKeyException("UQ_Tag_Slug"));
        when(mapper.findByNameOrSlug("Trọng sinh", "trong-sinh")).thenReturn(tag(9, "Trọng sinh", "trong-sinh"));

        service.replaceStoryTags(STORY, service.normalize(List.of("Trọng sinh")));

        verify(mapper).insertStoryTags(STORY, List.of(9));
        verify(mapper).adjustUsage(eq(List.of(9)), eq(1));
    }
}
