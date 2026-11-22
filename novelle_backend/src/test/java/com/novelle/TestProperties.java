package com.novelle;

/**
 * Properties every {@code @SpringBootTest} must use (one shared, cached context):
 * <ul>
 *   <li>no {@code @Scheduled} job: the view flush would otherwise commit real counters to the shared RDS while
 *       the suite runs (tests call {@code ViewFlusher.flush()} inside their rolled-back transaction instead);</li>
 *   <li>view keys under {@code it:views:}, so a running dev app (prefix {@code views:}) never flushes test views
 *       and tests never touch its counters.</li>
 * </ul>
 */
public final class TestProperties {

    public static final String JOBS_OFF = "app.jobs.enabled=false";
    public static final String VIEWS_PREFIX_VALUE = "it:views:";
    public static final String VIEWS_PREFIX = "app.views.key-prefix=" + VIEWS_PREFIX_VALUE;

    private TestProperties() {
    }
}
