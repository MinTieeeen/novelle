package com.novelle.dto;

import java.time.Instant;

/**
 * Result of the editor autosave (C4). {@code saved = false} when Redis was unavailable: the editor keeps the text
 * and only shows a warning, it never blocks the author (module-studio D8).
 */
public record DraftSaveResponse(boolean saved, Instant savedAt) {

    public static DraftSaveResponse saved(Instant savedAt) {
        return new DraftSaveResponse(true, savedAt);
    }

    public static DraftSaveResponse notSaved() {
        return new DraftSaveResponse(false, null);
    }
}
