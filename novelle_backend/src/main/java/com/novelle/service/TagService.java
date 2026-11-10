package com.novelle.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.novelle.exception.ApiException;
import com.novelle.infrastructure.html.SlugGenerator;
import com.novelle.mapper.TagMapper;
import com.novelle.model.Tag;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tags of a story (FR-M6-07, RB6). Names are normalised (trimmed, inner whitespace collapsed) and merged by slug;
 * unknown tags are created. {@code Tag.UsageCount} has no trigger, so this class keeps it equal to
 * {@code COUNT(StoryTag)}: +1 for each tag attached, −1 for each tag removed, in the caller's transaction.
 */
@Service
public class TagService {

    public static final int MAX_TAGS = 10;
    static final int NAME_MIN = 2;
    static final int NAME_MAX = 50;
    /** Tag.Slug is VARCHAR(60). */
    static final int SLUG_MAX = 60;

    private static final Pattern SPACES = Pattern.compile("\\s+");

    /** A tag as the author typed it, after normalisation; {@code slug} identifies it. */
    public record TagInput(String name, String slug) {
    }

    private final TagMapper tagMapper;
    private final SlugGenerator slugs;

    public TagService(TagMapper tagMapper, SlugGenerator slugs) {
        this.tagMapper = tagMapper;
        this.slugs = slugs;
    }

    /**
     * Validates and normalises the names (no database access, so it can run before any write). Duplicates — same
     * slug, e.g. "Hệ thống" and "he  thong" — are merged, keeping the first spelling. {@code null} = no tag.
     */
    public List<TagInput> normalize(List<String> names) {
        if (names == null) {
            return List.of();
        }
        Map<String, TagInput> bySlug = new LinkedHashMap<>();
        for (String raw : names) {
            String name = raw == null ? "" : SPACES.matcher(raw.strip()).replaceAll(" ");
            if (name.length() < NAME_MIN || name.length() > NAME_MAX) {
                throw ApiException.invalidField("tags",
                        "each tag must have " + NAME_MIN + "–" + NAME_MAX + " characters");
            }
            String slug = slugs.slugify(name, SLUG_MAX);
            if (slug.isEmpty()) {
                throw ApiException.invalidField("tags", "a tag must contain a letter or a digit");
            }
            bySlug.putIfAbsent(slug, new TagInput(name, slug));
        }
        if (bySlug.size() > MAX_TAGS) {
            throw ApiException.invalidField("tags", "at most " + MAX_TAGS + " tags");
        }
        return List.copyOf(bySlug.values());
    }

    /** Makes the story's tags exactly {@code wanted} and adjusts UsageCount of the tags added and removed. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void replaceStoryTags(int storyId, List<TagInput> wanted) {
        Set<Integer> target = resolveIds(wanted);
        Set<Integer> current = new LinkedHashSet<>(tagMapper.findStoryTagIds(storyId));

        List<Integer> toRemove = new ArrayList<>(current);
        toRemove.removeAll(target);
        List<Integer> toAdd = new ArrayList<>(target);
        toAdd.removeAll(current);

        if (!toRemove.isEmpty()) {
            tagMapper.deleteStoryTags(storyId, toRemove);
            tagMapper.adjustUsage(toRemove, -1);
        }
        if (!toAdd.isEmpty()) {
            tagMapper.insertStoryTags(storyId, toAdd);
            tagMapper.adjustUsage(toAdd, 1);
        }
    }

    /** Ids of the wanted tags, creating the missing ones. Two inputs may resolve to one tag (same name). */
    private Set<Integer> resolveIds(List<TagInput> wanted) {
        Set<Integer> ids = new LinkedHashSet<>();
        if (wanted.isEmpty()) {
            return ids;
        }
        Map<String, Tag> existing = new LinkedHashMap<>();
        for (Tag t : tagMapper.findBySlugs(wanted.stream().map(TagInput::slug).toList())) {
            existing.put(t.getSlug(), t);
        }
        for (TagInput in : wanted) {
            Tag tag = existing.get(in.slug());
            ids.add(tag != null ? tag.getTagId() : create(in));
        }
        return ids;
    }

    /**
     * Inserts a new tag. A concurrent request may have created it meanwhile, or another tag may already have this
     * name under the column's case and accent insensitive collation: the unique index refuses the insert (a
     * statement-level error, the transaction goes on) and the existing tag is used.
     */
    private int create(TagInput in) {
        Tag tag = new Tag();
        tag.setName(in.name());
        tag.setSlug(in.slug());
        try {
            tagMapper.insert(tag);
            return tag.getTagId();
        } catch (DuplicateKeyException ex) {
            Tag found = tagMapper.findByNameOrSlug(in.name(), in.slug());
            if (found == null) {
                throw ex;
            }
            return found.getTagId();
        }
    }
}
