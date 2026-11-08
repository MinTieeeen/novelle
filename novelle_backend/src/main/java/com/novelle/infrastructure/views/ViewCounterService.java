package com.novelle.infrastructure.views;

import java.time.Clock;
import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/**
 * Counts a chapter view on Redis (G6). The day is the calendar day in {@link ViewProperties#zone()} at the
 * moment of the view (module-reading D4); the same viewer counts once per chapter within
 * {@link ViewProperties#seenTtl()} (D1). Redis down: the view is skipped and the page still loads (fail open).
 */
@Service
public class ViewCounterService {

    private static final Logger log = LoggerFactory.getLogger(ViewCounterService.class);

    private final ViewCounterStore store;
    private final ViewProperties properties;
    private final Clock clock;

    @Autowired
    public ViewCounterService(ViewCounterStore store, ViewProperties properties) {
        this(store, properties, Clock.systemUTC());
    }

    /** For unit tests (fixed clock). */
    ViewCounterService(ViewCounterStore store, ViewProperties properties, Clock clock) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * @param userId        logged-in user, or null for a guest
     * @param remoteAddress socket address of the client, used for guests
     * @return true when the view was counted
     */
    public boolean record(int storyId, long chapterId, Integer userId, String remoteAddress) {
        String viewer = userId != null ? ViewKeys.userViewer(userId) : ViewKeys.ipViewer(remoteAddress);
        LocalDate day = LocalDate.now(clock.withZone(properties.zone()));
        try {
            return store.record(storyId, chapterId, day, viewer, properties.seenTtl());
        } catch (DataAccessException ex) {
            log.warn("View of chapter {} not counted, Redis unavailable: {}", chapterId, ex.getMessage());
            return false;
        }
    }
}
