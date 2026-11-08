package com.novelle.model;

import java.time.LocalDate;

/**
 * One row of {@code dbo.ViewDeltaTable}: views taken from a Redis counter, to be added by {@code sp_FlushViews}.
 * A record (not a mutable row object) because it is only ever a parameter, never a query result.
 *
 * @param targetType 'S' (story) or 'C' (chapter)
 * @param targetId   StoryId or ChapterId
 * @param viewDate   calendar day of the views in Vietnam time
 * @param delta      views to add, greater than 0 (CHECK of the table type)
 */
public record ViewDelta(char targetType, long targetId, LocalDate viewDate, int delta) {

    public ViewDelta {
        if (targetType != 'S' && targetType != 'C') {
            throw new IllegalArgumentException("targetType must be 'S' or 'C': " + targetType);
        }
        if (targetId <= 0 || delta <= 0 || viewDate == null) {
            throw new IllegalArgumentException("invalid view delta " + targetType + ":" + targetId + " " + delta);
        }
    }
}
