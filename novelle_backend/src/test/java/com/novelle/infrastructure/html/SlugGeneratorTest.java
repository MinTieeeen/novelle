package com.novelle.infrastructure.html;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SlugGeneratorTest {

    private final SlugGenerator slugs = new SlugGenerator();

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Kiếm Đạo Độc Tôn | kiem-dao-doc-ton",
            "đường về nhà | duong-ve-nha",
            "  Hệ   thống!!  | he-thong",
            "C++ & Java 21 | c-java-21",
            "ỨNG DỤNG Ưu Việt | ung-dung-uu-viet",
            "---a---b--- | a-b"})
    void slugifiesVietnameseText(String text, String expected) {
        assertThat(slugs.slugify(text, 350)).isEqualTo(expected);
    }

    @Test
    void textWithoutLetterOrDigitGivesEmpty() {
        assertThat(slugs.slugify("!!! ??? ...", 350)).isEmpty();
        assertThat(slugs.slugify(null, 350)).isEmpty();
    }

    @Test
    void cutsToTheMaximumWithoutTrailingHyphen() {
        // "abcd-efgh" cut at 5 is "abcd-": the trailing hyphen is removed
        assertThat(slugs.slugify("abcd efgh", 5)).isEqualTo("abcd");
        assertThat(slugs.slugify("x".repeat(400), 350)).hasSize(350);
    }

    @Test
    void suffixKeepsTheResultWithinTheMaximum() {
        assertThat(slugs.withSuffix("kiem-dao", 2, 350)).isEqualTo("kiem-dao-2");
        String base = "a".repeat(60);
        String withSuffix = slugs.withSuffix(base, 12, 60);
        assertThat(withSuffix).hasSize(60).endsWith("-12").startsWith("a".repeat(57));
    }

    @Test
    void suffixNeverDoublesAHyphen() {
        assertThat(slugs.withSuffix("abc-def", 3, 6)).isEqualTo("abc-3");
    }
}
