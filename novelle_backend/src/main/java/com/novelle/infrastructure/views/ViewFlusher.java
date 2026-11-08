package com.novelle.infrastructure.views;

import java.util.List;

import com.novelle.mapper.ViewFlushMapper;
import com.novelle.model.ViewDelta;
import com.novelle.model.ViewDeltaBatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Write-behind of view counters: Redis → {@code sp_FlushViews} (G6, docs/module-reading.md section 8.3).
 * Always a bean, so tests call {@link #flush()} directly while {@link ViewFlushJob} (the schedule) is off.
 * <p>
 * Not {@code @Transactional}: the procedure runs its own transaction per batch. Inside a test transaction its
 * BEGIN/COMMIT only nest, so the test rollback removes everything.
 */
@Service
public class ViewFlusher {

    private static final Logger log = LoggerFactory.getLogger(ViewFlusher.class);

    private final ViewCounterStore store;
    private final ViewFlushMapper mapper;
    private final ViewProperties properties;

    public ViewFlusher(ViewCounterStore store, ViewFlushMapper mapper, ViewProperties properties) {
        this.store = store;
        this.mapper = mapper;
        this.properties = properties;
    }

    /**
     * Flushes up to {@code flush-max-batches} batches; stops early when the dirty set is empty or on the first
     * error (the next run retries). Never throws.
     *
     * @return number of deltas written to SQL Server
     */
    public int flush() {
        int written = 0;
        for (int i = 0; i < properties.flushMaxBatches(); i++) {
            ViewCounterStore.Drained drained;
            try {
                drained = store.drain(properties.flushBatch());
            } catch (DataAccessException ex) {
                log.error("View flush skipped, Redis unavailable: {}", ex.getMessage());
                break;
            }
            if (drained.taken() == 0) {
                break;
            }
            List<ViewDelta> deltas = drained.deltas();
            if (!deltas.isEmpty()) {
                try {
                    mapper.flush(new ViewDeltaBatch(deltas));
                    written += deltas.size();
                } catch (RuntimeException ex) {
                    log.error("sp_FlushViews failed for {} counters, putting them back into Redis", deltas.size(), ex);
                    restore(deltas);
                    break;
                }
            }
            if (drained.taken() < properties.flushBatch()) {
                break;
            }
        }
        if (written > 0) {
            log.debug("Flushed {} view counters", written);
        }
        return written;
    }

    private void restore(List<ViewDelta> deltas) {
        try {
            store.restore(deltas);
        } catch (DataAccessException ex) {
            // only case where views are lost after being counted (docs/module-reading.md section 12, #1)
            log.error("Could not put {} view counters back into Redis, these views are lost: {}",
                    deltas.size(), ex.getMessage());
        }
    }
}
