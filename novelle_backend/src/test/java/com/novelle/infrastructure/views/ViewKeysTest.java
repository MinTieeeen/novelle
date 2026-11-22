package com.novelle.infrastructure.views;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import com.novelle.model.ViewDelta;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class ViewKeysTest {

    private static final LocalDate DAY = LocalDate.of(2026, 11, 8);

    private final ViewKeys keys = new ViewKeys("views:");

    @Test
    void keyNamesFollowTheDataDictionary() {
        assertThat(keys.dirty()).isEqualTo("views:dirty");
        assertThat(keys.seen(2, "u17")).isEqualTo("views:seen:2:u17");
        assertThat(keys.storyCounter(1, DAY)).isEqualTo("views:story:1:20261108");
        assertThat(keys.chapterCounter(2, DAY)).isEqualTo("views:chapter:2:20261108");
        assertThat(keys.storyMember(1, DAY)).isEqualTo("S:1:20261108");
        assertThat(keys.chapterMember(2, DAY)).isEqualTo("C:2:20261108");
    }

    @Test
    void prefixIsConfigurable() {
        ViewKeys test = new ViewKeys("it:views:");
        assertThat(test.dirty()).isEqualTo("it:views:dirty");
        assertThat(test.chapterCounter(5, DAY)).isEqualTo("it:views:chapter:5:20261108");
    }

    @Test
    void viewerIds() {
        assertThat(ViewKeys.userViewer(17)).isEqualTo("u17");
        assertThat(ViewKeys.ipViewer("203.0.113.7")).isEqualTo("ip203.0.113.7");
    }

    @Test
    void memberRoundTripsToItsCounter() {
        ViewKeys.Member member = ViewKeys.parseMember("C:42:20261231").orElseThrow();

        assertThat(member).isEqualTo(new ViewKeys.Member('C', 42, LocalDate.of(2026, 12, 31)));
        assertThat(member.toString()).isEqualTo("C:42:20261231");
        assertThat(keys.counterOf(member)).isEqualTo("views:chapter:42:20261231");
        assertThat(keys.counterOf(ViewKeys.parseMember("S:7:20261108").orElseThrow()))
                .isEqualTo("views:story:7:20261108");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "bad-member", "X:1:20261108", "S:1", "S:abc:20261108", "S:1:2026-11-08",
            "S:1:20261340", "S:0:20261108", "S:-3:20261108", "SS:1:20261108", "S:1:20261108:extra"})
    void unreadableMembersAreEmpty(String value) {
        assertThat(ViewKeys.parseMember(value)).isEmpty();
    }

    @Test
    void viewDeltaRejectsValuesTheTableTypeWouldReject() {
        assertThatThrownBy(() -> new ViewDelta('X', 1, DAY, 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ViewDelta('S', 0, DAY, 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ViewDelta('S', 1, DAY, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ViewDelta('S', 1, null, 1)).isInstanceOf(IllegalArgumentException.class);
    }
}
