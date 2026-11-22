package com.novelle.infrastructure.mybatis;

import java.util.Arrays;
import java.util.Base64;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Value of a SQL Server {@code ROWVERSION} column (8 bytes), used for optimistic locking:
 * the client receives it as a Base64 string and sends it back with the update, which runs
 * {@code UPDATE … WHERE … AND RowVer = #{rowVersion}}; 0 affected rows means someone else changed the row.
 */
public final class RowVersion {

    private static final int LENGTH = 8;

    private final byte[] bytes;

    public RowVersion(byte[] bytes) {
        if (bytes == null || bytes.length != LENGTH) {
            throw new IllegalArgumentException("A ROWVERSION value has exactly " + LENGTH + " bytes.");
        }
        this.bytes = bytes.clone();
    }

    /** Parses the Base64 form sent by clients; an invalid value becomes a 400 (unreadable request body). */
    @JsonCreator
    public static RowVersion fromBase64(String value) {
        return new RowVersion(Base64.getDecoder().decode(value));
    }

    @JsonValue
    public String toBase64() {
        return Base64.getEncoder().encodeToString(bytes);
    }

    public byte[] toBytes() {
        return bytes.clone();
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof RowVersion other && Arrays.equals(bytes, other.bytes);
    }

    @Override
    public int hashCode() {
        return Arrays.hashCode(bytes);
    }

    @Override
    public String toString() {
        return toBase64();
    }
}
