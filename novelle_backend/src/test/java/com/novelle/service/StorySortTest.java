package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import com.novelle.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

class StorySortTest {

    @Test
    void defaultIsRelevanceWithTextAndUpdatedWithout() {
        assertThat(StorySort.resolve(null, true)).isEqualTo(StorySort.RELEVANCE);
        assertThat(StorySort.resolve(" ", false)).isEqualTo(StorySort.UPDATED);
    }

    @Test
    void valuesAreCaseInsensitive() {
        assertThat(StorySort.resolve(" Views ", false)).isEqualTo(StorySort.VIEWS);
        assertThat(StorySort.resolve("RATING", true)).isEqualTo(StorySort.RATING);
    }

    @ParameterizedTest
    @EnumSource(StorySort.class)
    void everyClauseEndsWithTheStableTieBreaker(StorySort sort) {
        assertThat(sort.orderBy()).endsWith(", s.StoryId DESC");
        assertThat(StorySort.resolve(sort.param(), true)).isEqualTo(sort);
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc", "StoryId; DROP TABLE dbo.Story", "updated desc"})
    void unknownValueIs400OnSort(String value) {
        assertInvalidSort(value, true);
    }

    @Test
    void relevanceWithoutTextIs400() {
        assertInvalidSort("relevance", false);
    }

    private static void assertInvalidSort(String value, boolean hasText) {
        assertThatThrownBy(() -> StorySort.resolve(value, hasText))
                .isInstanceOfSatisfying(ApiException.class, ex -> {
                    assertThat(ex.code()).isEqualTo(ErrorCode.VALIDATION_FAILED);
                    assertThat((List<?>) ex.details()).singleElement()
                            .extracting(e -> ((ApiError.FieldError) e).field()).isEqualTo("sort");
                });
    }
}
