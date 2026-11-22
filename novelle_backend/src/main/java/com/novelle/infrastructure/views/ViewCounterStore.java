package com.novelle.infrastructure.views;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.novelle.model.ViewDelta;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

/**
 * Redis side of view counting: the three Lua scripts of {@code resources/redis/} (run with EVALSHA, falling
 * back to EVAL the first time). Knows nothing about SQL; Redis errors ({@code DataAccessException}) are thrown
 * to the caller, which decides whether to fail open.
 */
@Component
public class ViewCounterStore {

    private static final Logger log = LoggerFactory.getLogger(ViewCounterStore.class);

    private static final RedisScript<Long> RECORD =
            RedisScript.of(new ClassPathResource("redis/views-record.lua"), Long.class);
    @SuppressWarnings("rawtypes")
    private static final RedisScript<List> DRAIN =
            RedisScript.of(new ClassPathResource("redis/views-drain.lua"), List.class);
    private static final RedisScript<Long> RESTORE =
            RedisScript.of(new ClassPathResource("redis/views-restore.lua"), Long.class);

    private final StringRedisTemplate redis;
    private final ViewKeys keys;

    public ViewCounterStore(StringRedisTemplate redis, ViewKeys keys) {
        this.redis = redis;
        this.keys = keys;
    }

    /** Counts one view unless {@code viewer} was counted for this chapter within {@code seenTtl}. */
    public boolean record(int storyId, long chapterId, LocalDate day, String viewer, Duration seenTtl) {
        Long counted = redis.execute(RECORD,
                List.of(keys.seen(chapterId, viewer), keys.storyCounter(storyId, day),
                        keys.chapterCounter(chapterId, day), keys.dirty()),
                String.valueOf(seenTtl.toSeconds()),
                keys.storyMember(storyId, day), keys.chapterMember(chapterId, day));
        return counted != null && counted == 1L;
    }

    /**
     * Removes up to {@code batch} counters from Redis and returns them. Members that cannot be parsed are
     * dropped with a warning; {@link Drained#taken()} still counts them, so the caller knows the set was not
     * empty.
     */
    public Drained drain(int batch) {
        List<?> raw = redis.execute(DRAIN, List.of(keys.dirty()), String.valueOf(batch), keys.prefix());
        if (raw == null || raw.isEmpty()) {
            return new Drained(List.of(), 0);
        }
        List<ViewDelta> deltas = new ArrayList<>(raw.size() / 2);
        for (int i = 0; i + 1 < raw.size(); i += 2) {
            String member = String.valueOf(raw.get(i));
            Optional<ViewDelta> delta = toDelta(member, String.valueOf(raw.get(i + 1)));
            if (delta.isPresent()) {
                deltas.add(delta.get());
            } else {
                log.warn("Dropped unreadable view counter {} = {}", member, raw.get(i + 1));
            }
        }
        return new Drained(deltas, raw.size() / 2);
    }

    /** Adds drained deltas back (after the SQL flush failed). */
    public long restore(List<ViewDelta> deltas) {
        if (deltas.isEmpty()) {
            return 0;
        }
        List<String> args = new ArrayList<>(1 + deltas.size() * 2);
        args.add(keys.prefix());
        for (ViewDelta d : deltas) {
            args.add(new ViewKeys.Member(d.targetType(), d.targetId(), d.viewDate()).toString());
            args.add(String.valueOf(d.delta()));
        }
        Long restored = redis.execute(RESTORE, List.of(keys.dirty()), args.toArray());
        return restored == null ? 0 : restored;
    }

    private static Optional<ViewDelta> toDelta(String member, String value) {
        Optional<ViewKeys.Member> parsed = ViewKeys.parseMember(member);
        if (parsed.isEmpty()) {
            return Optional.empty();
        }
        long count;
        try {
            count = Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return Optional.empty();
        }
        if (count <= 0 || count > Integer.MAX_VALUE) {
            return Optional.empty();
        }
        ViewKeys.Member m = parsed.get();
        return Optional.of(new ViewDelta(m.type(), m.targetId(), m.day(), (int) count));
    }

    /**
     * @param deltas counters taken out of Redis, ready for {@code sp_FlushViews}
     * @param taken  members popped from the dirty set, including unreadable ones
     */
    public record Drained(List<ViewDelta> deltas, int taken) {
    }
}
