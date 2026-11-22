package com.novelle.infrastructure.views;

import com.novelle.config.SchedulingConfig;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Schedule of {@link ViewFlusher}: every {@code app.views.flush-interval} after the previous run ended
 * ({@code fixedDelay}, so runs never overlap in one instance). Created only when {@code app.jobs.enabled}.
 */
@Component
@ConditionalOnProperty(name = SchedulingConfig.JOBS_ENABLED, havingValue = "true", matchIfMissing = true)
public class ViewFlushJob {

    private final ViewFlusher flusher;

    public ViewFlushJob(ViewFlusher flusher) {
        this.flusher = flusher;
    }

    @Scheduled(fixedDelayString = "${app.views.flush-interval}", initialDelayString = "${app.views.flush-interval}")
    public void run() {
        flusher.flush();
    }

    /**
     * Last flush on a graceful shutdown, so a restart loses no views. This bean depends on the flusher (and so on
     * the mapper and the data source), which are therefore destroyed after it.
     */
    @PreDestroy
    void flushOnShutdown() {
        flusher.flush();
    }
}
