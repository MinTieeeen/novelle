package com.novelle.infrastructure.jobs;

import com.novelle.config.SchedulingConfig;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Schedule of {@link ScheduledPublisher}: every {@code app.studio.publish-interval} after the previous run ended
 * ({@code fixedDelay}, so runs never overlap in one instance). Replaces a SQL Server Agent job, which RDS Express
 * does not offer. Created only when {@code app.jobs.enabled}.
 */
@Component
@ConditionalOnProperty(name = SchedulingConfig.JOBS_ENABLED, havingValue = "true", matchIfMissing = true)
public class ScheduledPublishJob {

    private final ScheduledPublisher publisher;

    public ScheduledPublishJob(ScheduledPublisher publisher) {
        this.publisher = publisher;
    }

    @Scheduled(fixedDelayString = "${app.studio.publish-interval}",
               initialDelayString = "${app.studio.publish-interval}")
    public void run() {
        publisher.publishDue();
    }
}
