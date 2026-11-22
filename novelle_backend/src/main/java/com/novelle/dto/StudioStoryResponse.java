package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.novelle.model.GenreRef;
import com.novelle.model.StudioStory;
import com.novelle.model.Tag;

/**
 * One of my stories as edited in the studio (S2–S8). {@code version} is {@code UpdatedAt}, sent back unchanged by
 * PATCH (optimistic lock, docs/module-studio.md D4). {@code hiddenReason} only when an administrator hid it.
 */
public record StudioStoryResponse(
        int storyId,
        String slug,
        String title,
        String description,
        String coverUrl,
        String ageRating,
        String completionStatus,
        String publishStatus,
        String hiddenReason,
        List<StoryDetailResponse.Genre> genres,
        List<StoryDetailResponse.TagItem> tags,
        int chapterCount,
        long wordCount,
        long viewCount,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        Instant publishedAt,
        Instant lastChapterAt,
        Instant createdAt,
        Instant version) {

    public static StudioStoryResponse from(StudioStory s, List<GenreRef> genres, List<Tag> tags) {
        return new StudioStoryResponse(s.getStoryId(), s.getSlug(), s.getTitle(), s.getDescription(),
                s.getCoverUrl(), s.getAgeRating(), s.getCompletionStatus(), s.getPublishStatus(),
                s.getHiddenReason(),
                genres.stream().map(StoryDetailResponse.Genre::from).toList(),
                tags.stream().map(StoryDetailResponse.TagItem::from).toList(),
                s.getChapterCount(), s.getWordCount(), s.getViewCount(), s.getFollowCount(), s.getRatingAvg(),
                s.getRatingCount(), Times.utc(s.getPublishedAt()), Times.utc(s.getLastChapterAt()),
                Times.utc(s.getCreatedAt()), Times.utc(s.getUpdatedAt()));
    }
}
