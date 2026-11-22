package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.ChapterNav;
import com.novelle.model.VolumeRef;

/**
 * GET /api/chapters/{chapterId}. {@code volume}, {@code prevChapterId}, {@code nextChapterId} are omitted when
 * absent; {@code myScrollPercent} only for a logged-in reader (module-reading D2). {@code viewCount} is the SQL
 * value, without views not flushed yet.
 */
public record ChapterReadResponse(
        long chapterId,
        int chapterNo,
        String title,
        String content,
        int wordCount,
        Instant publishedAt,
        long viewCount,
        Story story,
        Volume volume,
        Long prevChapterId,
        Long nextChapterId,
        BigDecimal myScrollPercent) {

    public record Story(int storyId, String slug, String title, StoryCardResponse.Author author) {
    }

    public record Volume(int volumeId, int volumeNo, String title) {

        static Volume from(VolumeRef v) {
            return v == null ? null : new Volume(v.getVolumeId(), v.getVolumeNo(), v.getTitle());
        }
    }

    public static ChapterReadResponse from(ChapterNav nav, ChapterContentCache content, BigDecimal myScrollPercent) {
        Story story = new Story(nav.getStoryId(), nav.getStorySlug(), nav.getStoryTitle(),
                StoryCardResponse.Author.from(nav.getAuthor()));
        return new ChapterReadResponse(nav.getChapterId(), nav.getChapterNo(), content.title(), content.content(),
                content.wordCount(), content.publishedAt(), nav.getViewCount(), story, Volume.from(nav.getVolume()),
                nav.getPrevChapterId(), nav.getNextChapterId(), myScrollPercent);
    }
}
