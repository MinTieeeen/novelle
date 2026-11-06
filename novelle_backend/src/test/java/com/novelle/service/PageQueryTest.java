package com.novelle.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import com.novelle.exception.ApiError;
import com.novelle.exception.ApiException;
import org.junit.jupiter.api.Test;

class PageQueryTest {

    @Test
    void defaultsAndOffset() {
        PageQuery q = PageQuery.of(null, null);
        assertThat(q.page()).isZero();
        assertThat(q.size()).isEqualTo(PageQuery.DEFAULT_SIZE);
        assertThat(PageQuery.of(3, 10).offset()).isEqualTo(30);
    }

    @Test
    void boundsAreAccepted() {
        assertThat(PageQuery.of(0, 1).size()).isEqualTo(1);
        assertThat(PageQuery.of(0, 50).size()).isEqualTo(50);
        assertThat(PageQuery.of(199, 50).offset()).isEqualTo(9_950);    // ends exactly at row 10 000
    }

    @Test
    void invalidValuesNameTheirField() {
        assertField(() -> PageQuery.of(-1, 20), "page");
        assertField(() -> PageQuery.of(0, 0), "size");
        assertField(() -> PageQuery.of(0, 51), "size");
        assertField(() -> PageQuery.of(200, 50), "page");               // would end at row 10 050
        assertField(() -> PageQuery.of(Integer.MAX_VALUE, 50), "page"); // no int overflow
    }

    private static void assertField(Runnable call, String field) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, ex ->
                assertThat((List<?>) ex.details()).singleElement()
                        .extracting(e -> ((ApiError.FieldError) e).field()).isEqualTo(field));
    }
}
