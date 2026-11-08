package com.novelle.model;

import java.util.List;

/**
 * The table-valued parameter of {@code sp_FlushViews}, converted by
 * {@link com.novelle.infrastructure.mybatis.ViewDeltaBatchTypeHandler}. A dedicated wrapper type on purpose:
 * a handler registered for {@code List} (through {@code mybatis.type-handlers-package}) would catch every
 * list parameter of every mapper.
 *
 * @param deltas at most one entry per (targetType, targetId, viewDate): the PRIMARY KEY of the table type
 */
public record ViewDeltaBatch(List<ViewDelta> deltas) {

    public ViewDeltaBatch {
        deltas = List.copyOf(deltas);
    }

    public boolean isEmpty() {
        return deltas.isEmpty();
    }
}
