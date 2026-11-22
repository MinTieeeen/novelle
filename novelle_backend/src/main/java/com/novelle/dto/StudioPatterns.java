package com.novelle.dto;

/** Validation patterns shared by the studio request bodies (docs/module-studio.md section 7.5). */
final class StudioPatterns {

    /** A cover from the provided set, e.g. {@code /covers/tien-hiep/03.jpg} (data-dictionary 9.6). */
    static final String COVER_URL = "^/covers/[a-z0-9-]+/\\d{2}\\.jpg$";

    /** Same as {@link #COVER_URL}, or empty to clear the cover (PATCH). */
    static final String COVER_URL_OR_EMPTY = "^$|" + COVER_URL;

    static final String AGE_RATING = "^(ALL|13\\+|18\\+)$";

    static final String COMPLETION_STATUS = "^(ONGOING|COMPLETED|HIATUS)$";

    /** At least one character that is not whitespace. */
    static final String NOT_BLANK = "(?s).*\\S.*";

    private StudioPatterns() {
    }
}
