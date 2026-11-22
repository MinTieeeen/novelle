package com.novelle.infrastructure.jobs;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.novelle.infrastructure.cache.CacheKeys;
import com.novelle.infrastructure.cache.CacheService;
import com.novelle.mapper.StudioChapterMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Publishes the scheduled chapters that are due (RB11, FR-M6-31): one call of {@code sp_PublishScheduled}, which
 * reads the due rows WITH (UPDLOCK, READPAST, ROWLOCK) so two instances never publish the same chapter and never
 * wait on each other. Then evicts {@code cache:story} of the stories that got a chapter, and {@code cache:home}.
 * Always present (also when jobs are off), so tests call {@link #publishDue()} directly.
 */
@Service
public class ScheduledPublisher {

    private static final Logger log = LoggerFactory.getLogger(ScheduledPublisher.class);

    private final StudioChapterMapper chapterMapper;
    private final CacheService cache;

    public ScheduledPublisher(StudioChapterMapper chapterMapper, CacheService cache) {
        this.chapterMapper = chapterMapper;
        this.cache = cache;
    }

    /**
     * Not {@code @Transactional}: the procedure owns its transaction. Errors are logged, never thrown: the next
     * run tries again. Returns the number of chapters published (0 on error).
     * <p>
     * The start instant is read from SQL Server, not from the JVM: the procedure stamps PublishedAt with its own
     * {@code SYSUTCDATETIME()}, and an application clock running ahead of the database would miss those rows.
     */
    public int publishDue() {
        int published;
        LocalDateTime runStart;
        try {
            runStart = chapterMapper.dbNow();
            Integer count = chapterMapper.publishScheduled();
            published = count == null ? 0 : count;
        } catch (RuntimeException ex) {
            log.error("sp_PublishScheduled failed, retrying at the next run", ex);
            return 0;
        }
        if (published == 0) {
            return 0;
        }
        try {
            List<String> keys = new ArrayList<>();
            for (int storyId : chapterMapper.storiesPublishedSince(runStart)) {
                keys.add(CacheKeys.story(storyId));
            }
            keys.add(CacheKeys.HOME);
            cache.evict(keys.toArray(String[]::new));
        } catch (RuntimeException ex) {
            log.warn("Published {} scheduled chapters but could not evict the caches: {}", published, ex.getMessage());
        }
        log.info("Published {} scheduled chapter(s)", published);
        return published;
    }
}
