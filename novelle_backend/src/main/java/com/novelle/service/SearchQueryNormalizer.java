package com.novelle.service;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Turns the search box text into safe full-text terms, one per word: {@code "Vĩnh hằng!"} →
 * {@code ["\"vĩnh*\"", "\"hằng*\""]}.
 * <ul>
 *   <li>Unicode NFC first (a macOS keyboard may send decomposed tone marks; the data is NFC);</li>
 *   <li>only letters and digits survive, so quotes, {@code *}, parentheses cannot break the CONTAINS syntax,
 *       and words such as {@code OR}/{@code NEAR} become plain quoted terms;</li>
 *   <li>duplicates removed (case-insensitive), at most {@value #MAX_TERMS} terms of at most {@value #MAX_TERM_LENGTH} chars.</li>
 * </ul>
 * Each term goes into its own {@code CONTAINSTABLE} (a multi-word expression over (Title, Description) only
 * matches when all words are in the same column; see docs/module-catalog.md section 5.1).
 */
public final class SearchQueryNormalizer {

    public static final int MAX_TERMS = 8;
    public static final int MAX_TERM_LENGTH = 50;

    private static final Pattern NOT_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    private SearchQueryNormalizer() {
    }

    /** Prefix terms ready for CONTAINSTABLE; empty when the text has no letter or digit. */
    public static List<String> toTerms(String text) {
        if (text == null) {
            return List.of();
        }
        String nfc = Normalizer.normalize(text, Normalizer.Form.NFC);
        return Arrays.stream(NOT_WORD.split(nfc))
                .filter(w -> !w.isEmpty())
                .map(w -> w.length() > MAX_TERM_LENGTH ? w.substring(0, MAX_TERM_LENGTH) : w)
                .map(w -> w.toLowerCase(Locale.ROOT))
                .distinct()
                .limit(MAX_TERMS)
                .map(w -> "\"" + w + "*\"")
                .toList();
    }
}
