package com.novelle.infrastructure.mybatis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class RowVersionTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void roundTripsThroughJsonAsBase64() throws Exception {
        RowVersion rv = new RowVersion(new byte[] {0, 0, 0, 0, 0, 0, 0x07, (byte) 0xD1});

        String json = mapper.writeValueAsString(rv);
        assertThat(json).isEqualTo("\"AAAAAAAAB9E=\"");
        assertThat(mapper.readValue(json, RowVersion.class)).isEqualTo(rv);
    }

    @Test
    void rejectsValuesThatAreNotEightBytes() {
        assertThatThrownBy(() -> RowVersion.fromBase64("AAAA")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RowVersion.fromBase64("not base64!")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void copiesItsBytes() {
        byte[] raw = new byte[8];
        RowVersion rv = new RowVersion(raw);
        raw[0] = 1;
        rv.toBytes()[1] = 1;
        assertThat(rv.toBytes()).containsOnly(0);
    }
}
