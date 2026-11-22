package com.novelle.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Background jobs ({@code @Scheduled}: view flush, later the scheduled-publish job of M6) run only when
 * {@code app.jobs.enabled} is true (env {@code JOBS_ENABLED}, default true). Tests turn it off and call the
 * job logic directly, so nothing is committed outside the test transaction. The pool size and thread names
 * come from {@code spring.task.scheduling.*} in application.yml.
 */
@Configuration
public class SchedulingConfig {

    public static final String JOBS_ENABLED = "app.jobs.enabled";

    @Configuration
    @EnableScheduling
    @ConditionalOnProperty(name = JOBS_ENABLED, havingValue = "true", matchIfMissing = true)
    static class Enabled {
    }

    @Configuration
    @ConditionalOnProperty(name = JOBS_ENABLED, havingValue = "false")
    static class Disabled {

        private static final Logger log = LoggerFactory.getLogger(SchedulingConfig.class);

        @EventListener(ApplicationReadyEvent.class)
        void warn() {
            log.warn("Background jobs are disabled ({}=false): view counters stay in Redis and are not flushed "
                    + "to SQL Server. Use this only for tests and local checks.", JOBS_ENABLED);
        }
    }
}
