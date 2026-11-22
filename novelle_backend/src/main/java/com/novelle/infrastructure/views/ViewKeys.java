package com.novelle.infrastructure.views;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The only place that knows the names of the view keys (docs/module-reading.md section 5.2). With
 * {@code prefix} = {@link ViewProperties#keyPrefix()} and {@code date} = {@code yyyyMMdd} in Vietnam time:
 * <ul>
 *   <li>{@code {prefix}story:{storyId}:{date}}, {@code {prefix}chapter:{chapterId}:{date}}: counters (INCR);</li>
 *   <li>{@code {prefix}dirty}: set of members {@code S:{storyId}:{date}} / {@code C:{chapterId}:{date}} waiting
 *       for the flush;</li>
 *   <li>{@code {prefix}seen:{chapterId}:{viewer}}: "already counted" marker, viewer {@code u{userId}} or
 *       {@code ip{address}}.</li>
 * </ul>
 * The Lua scripts {@code views-drain.lua} and {@code views-restore.lua} rebuild the counter name from a member
 * the same way as {@link #counterOf(Member)}; keep them in step.
 */
@Component
public class ViewKeys {

    /** {@code yyyyMMdd}. */
    public static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;

    public static final char STORY = 'S';
    public static final char CHAPTER = 'C';

    private final String prefix;

    @Autowired
    public ViewKeys(ViewProperties properties) {
        this(properties.keyPrefix());
    }

    /** For unit tests. */
    ViewKeys(String prefix) {
        this.prefix = prefix;
    }

    public String prefix() {
        return prefix;
    }

    public String dirty() {
        return prefix + "dirty";
    }

    public String seen(long chapterId, String viewer) {
        return prefix + "seen:" + chapterId + ":" + viewer;
    }

    public String storyCounter(int storyId, LocalDate day) {
        return counterOf(new Member(STORY, storyId, day));
    }

    public String chapterCounter(long chapterId, LocalDate day) {
        return counterOf(new Member(CHAPTER, chapterId, day));
    }

    public String storyMember(int storyId, LocalDate day) {
        return new Member(STORY, storyId, day).toString();
    }

    public String chapterMember(long chapterId, LocalDate day) {
        return new Member(CHAPTER, chapterId, day).toString();
    }

    /** Counter key of a dirty-set member. */
    public String counterOf(Member member) {
        String kind = member.type() == STORY ? "story:" : "chapter:";
        return prefix + kind + member.targetId() + ":" + DATE.format(member.day());
    }

    /** Viewer id of a logged-in user. */
    public static String userViewer(int userId) {
        return "u" + userId;
    }

    /** Viewer id of an anonymous client (socket address, X-Forwarded-For is not trusted). */
    public static String ipViewer(String remoteAddress) {
        return "ip" + remoteAddress;
    }

    /** Parses {@code S:12:20261108}; anything else (written by hand, older format) gives empty. */
    public static Optional<Member> parseMember(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String[] parts = value.split(":", -1);
        if (parts.length != 3 || parts[0].length() != 1) {
            return Optional.empty();
        }
        char type = parts[0].charAt(0);
        if (type != STORY && type != CHAPTER) {
            return Optional.empty();
        }
        try {
            long id = Long.parseLong(parts[1]);
            LocalDate day = LocalDate.parse(parts[2], DATE);
            return id > 0 ? Optional.of(new Member(type, id, day)) : Optional.empty();
        } catch (NumberFormatException | DateTimeParseException ex) {
            return Optional.empty();
        }
    }

    /**
     * One counter waiting for the flush: {@code type} {@link #STORY} or {@link #CHAPTER} (the TargetType of
     * {@code dbo.ViewDeltaTable}), the story or chapter id and the Vietnam calendar day of the views.
     */
    public record Member(char type, long targetId, LocalDate day) {

        @Override
        public String toString() {
            return type + ":" + targetId + ":" + DATE.format(day);
        }
    }
}
