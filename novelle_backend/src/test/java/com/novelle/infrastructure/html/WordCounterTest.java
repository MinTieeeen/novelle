package com.novelle.infrastructure.html;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class WordCounterTest {

    private final WordCounter counter = new WordCounter();

    @Test
    void countsVietnameseWords() {
        assertThat(counter.count("<p>Thiếu niên mang kiếm cốt</p>")).isEqualTo(5);
    }

    @Test
    void blockTagsAndLineBreaksSeparateWords() {
        assertThat(counter.count("<p>một</p><p>hai</p><h2>ba</h2>bốn<br>năm")).isEqualTo(5);
    }

    @Test
    void nestedTagsDoNotSplitAWord() {
        assertThat(counter.count("<p><strong>đậ</strong>m nhạt</p>")).isEqualTo(2);
    }

    @Test
    void nonBreakingSpacesAndRunsOfSpacesSeparateWords() {
        assertThat(counter.count("<p>a&nbsp;b \t  c　d</p>")).isEqualTo(4);
    }

    @Test
    void punctuationStuckToAWordIsPartOfIt() {
        assertThat(counter.count("<p>Xin chào, thế giới!</p>")).isEqualTo(4);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"  ", "<p></p>", "<p>&nbsp;</p>", "<br>"})
    void emptyContentHasNoWord(String html) {
        assertThat(counter.count(html)).isZero();
    }
}
