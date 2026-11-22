package com.novelle.infrastructure.html;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Builds URL slugs from Vietnamese text (data-dictionary section 9, FR-M6-03): accents removed, {@code đ → d},
 * lower case, only {@code a-z0-9} joined by single hyphens, never starting or ending with a hyphen.
 * Story slugs ({@code VARCHAR(350)}) and tag slugs ({@code VARCHAR(60)}) pass their own maximum length.
 */
@Component
public class SlugGenerator {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    /** Slug of {@code text}, at most {@code maxLength} characters; empty when the text has no letter or digit. */
    public String slugify(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        String s = text.replace('đ', 'd').replace('Đ', 'D');
        s = MARKS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("");
        s = NON_ALNUM.matcher(s.toLowerCase(Locale.ROOT)).replaceAll("-");
        return trimHyphens(cut(trimHyphens(s), maxLength));
    }

    /**
     * {@code base} with the suffix {@code -n} (n ≥ 2) appended; the base is shortened first so the result still
     * fits in {@code maxLength}.
     */
    public String withSuffix(String base, int n, int maxLength) {
        String suffix = "-" + n;
        return trimHyphens(cut(base, maxLength - suffix.length())) + suffix;
    }

    private static String cut(String s, int maxLength) {
        return s.length() <= maxLength ? s : s.substring(0, Math.max(0, maxLength));
    }

    private static String trimHyphens(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && s.charAt(start) == '-') {
            start++;
        }
        while (end > start && s.charAt(end - 1) == '-') {
            end--;
        }
        return s.substring(start, end);
    }
}
