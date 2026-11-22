package com.novelle.infrastructure.html;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class HtmlSanitizerTest {

    private final HtmlSanitizer sanitizer = new HtmlSanitizer();

    @Test
    void keepsTheAllowedTags() {
        String html = "<h2>Một</h2><h3>Hai</h3><h4>Ba</h4><p>Đoạn <em>nghiêng</em> và <strong>đậm</strong><br>dòng</p>"
                + "<blockquote>Trích</blockquote>";
        assertThat(sanitizer.sanitize(html)).isEqualTo(html);
    }

    @Test
    void removesScriptsWithTheirContent() {
        assertThat(sanitizer.sanitize("<p>An toàn</p><script>alert(1)</script>")).isEqualTo("<p>An toàn</p>");
    }

    @Test
    void removesEveryAttribute() {
        assertThat(sanitizer.sanitize("<p onclick=\"x()\" style=\"color:red\" class=\"c\">Chữ</p>"))
                .isEqualTo("<p>Chữ</p>");
    }

    @Test
    void dropsOtherTagsButKeepsTheirText() {
        assertThat(sanitizer.sanitize("<p><a href=\"javascript:x()\">liên kết</a> <span>chữ</span>"
                + "<img src=x onerror=alert(1)></p><h1>Tiêu đề</h1>"))
                .isEqualTo("<p>liên kết chữ</p>Tiêu đề");
    }

    @Test
    void closesBrokenMarkup() {
        assertThat(sanitizer.sanitize("<p>chưa đóng <strong>đậm")).isEqualTo("<p>chưa đóng <strong>đậm</strong></p>");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\n"})
    void blankBecomesEmpty(String html) {
        assertThat(sanitizer.sanitize(html)).isEmpty();
    }
}
