package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.text.Normalizer;

import org.junit.jupiter.api.Test;

class SearchQueryNormalizerTest {

    @Test
    void eachWordBecomesALowerCasePrefixTerm() {
        assertThat(SearchQueryNormalizer.toTerms("  Vĩnh   Hằng "))
                .containsExactly("\"vĩnh*\"", "\"hằng*\"");
    }

    @Test
    void fullTextSyntaxIsStripped() {
        assertThat(SearchQueryNormalizer.toTerms("\"kiếm\" OR (thần*) NEAR ~đạo; DROP--"))
                .containsExactly("\"kiếm*\"", "\"or*\"", "\"thần*\"", "\"near*\"", "\"đạo*\"", "\"drop*\"");
    }

    @Test
    void digitsAreKept() {
        assertThat(SearchQueryNormalizer.toTerms("chương 2")).containsExactly("\"chương*\"", "\"2*\"");
    }

    @Test
    void decomposedInputIsNormalizedToNfc() {
        String nfd = Normalizer.normalize("Hằng", Normalizer.Form.NFD);
        assertThat(nfd).isNotEqualTo("Hằng");
        assertThat(SearchQueryNormalizer.toTerms(nfd)).containsExactly("\"hằng*\"");
    }

    @Test
    void duplicatesAreRemovedCaseInsensitively() {
        assertThat(SearchQueryNormalizer.toTerms("Hoa hoa HOA nở")).containsExactly("\"hoa*\"", "\"nở*\"");
    }

    @Test
    void atMostEightTermsOfAtMostFiftyChars() {
        assertThat(SearchQueryNormalizer.toTerms("a b c d e f g h i j")).hasSize(SearchQueryNormalizer.MAX_TERMS);
        String longWord = "x".repeat(80);
        assertThat(SearchQueryNormalizer.toTerms(longWord))
                .containsExactly("\"" + "x".repeat(SearchQueryNormalizer.MAX_TERM_LENGTH) + "*\"");
    }

    @Test
    void textWithoutLettersGivesNoTerm() {
        assertThat(SearchQueryNormalizer.toTerms("!!! ... ***")).isEmpty();
        assertThat(SearchQueryNormalizer.toTerms("")).isEmpty();
        assertThat(SearchQueryNormalizer.toTerms(null)).isEmpty();
    }
}
