package com.novelle.infrastructure.cache;

/** The only place that builds {@code draft:*} key names (data-dictionary section 8, module-studio D8). */
public final class DraftKeys {

    /** Prefix shared by every chapter draft (used by tests to clean up). */
    public static final String PREFIX = "draft:";

    /** Hash fields of a draft. */
    public static final String FIELD_TITLE = "title";
    public static final String FIELD_CONTENT = "content";
    public static final String FIELD_SAVED_AT = "savedAt";

    private DraftKeys() {
    }

    /** Autosaved, not yet saved, version of one chapter written by one author. */
    public static String chapter(int userId, long chapterId) {
        return PREFIX + userId + ":" + chapterId;
    }
}
