package com.novelle.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code app.studio.*}: author studio limits (F8–F10, docs/module-studio.md section 5.3).
 *
 * @param draftTtl          lifetime of an autosaved draft {@code draft:{userId}:{chapterId}} (env {@code STUDIO_DRAFT_TTL})
 * @param contentMaxLength  characters a chapter body may have before sanitizing (env {@code STUDIO_CONTENT_MAX_LENGTH})
 * @param scheduleMinLead   how far in the future a schedule must be at least (env {@code STUDIO_SCHEDULE_MIN_LEAD})
 * @param scheduleMaxAhead  how far in the future a schedule may be at most (env {@code STUDIO_SCHEDULE_MAX_AHEAD})
 * @param publishInterval   delay between two runs of the scheduled-publish job (env {@code STUDIO_PUBLISH_INTERVAL})
 */
@ConfigurationProperties(prefix = "app.studio")
public record StudioProperties(Duration draftTtl, int contentMaxLength, Duration scheduleMinLead,
        Duration scheduleMaxAhead, Duration publishInterval) {
}
