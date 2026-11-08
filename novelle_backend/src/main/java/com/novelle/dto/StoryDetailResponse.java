package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.novelle.model.AuthorRef;
import com.novelle.model.ChapterToc;
import com.novelle.model.GenreRef;
import com.novelle.model.StoryDetail;
import com.novelle.model.Tag;
import com.novelle.model.VolumeToc;

/**
 * GET /api/stories/{slug}: public data only (no per-user state, decision D2), so one cached copy
 * ({@code cache:story:{id}}) serves every reader.
 */
public record StoryDetailResponse(
        int storyId,
        String slug,
        String title,
        String description,
        String coverUrl,
        Author author,
        String completionStatus,
        String ageRating,
        int chapterCount,
        long wordCount,
        long viewCount,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        Instant lastChapterAt,
        Instant publishedAt,
        List<Genre> genres,
        List<TagItem> tags,
        List<Volume> volumes,
        List<Chapter> looseChapters) {

    public record Author(int authorId, String penName, @JsonProperty("isVerified") boolean isVerified) {

        static Author from(AuthorRef a) {
            return a == null ? null : new Author(a.getAuthorId(), a.getPenName(), a.isVerified());
        }
    }

    public record Genre(int genreId, String name, String slug, @JsonProperty("isPrimary") boolean isPrimary) {

        static Genre from(GenreRef g) {
            return new Genre(g.getGenreId(), g.getName(), g.getSlug(), g.isPrimary());
        }
    }

    public record TagItem(int tagId, String name, String slug) {

        static TagItem from(Tag t) {
            return new TagItem(t.getTagId(), t.getName(), t.getSlug());
        }
    }

    public record Volume(int volumeId, int volumeNo, String title, List<Chapter> chapters) {

        static Volume from(VolumeToc v) {
            return new Volume(v.getVolumeId(), v.getVolumeNo(), v.getTitle(),
                    v.getChapters().stream().map(Chapter::from).toList());
        }
    }

    public record Chapter(long chapterId, int chapterNo, String title, Instant publishedAt) {

        static Chapter from(ChapterToc c) {
            return new Chapter(c.getChapterId(), c.getChapterNo(), c.getTitle(), Times.utc(c.getPublishedAt()));
        }
    }

    /** Genres must already be in display order (primary first), as StoryMapper.findGenres returns them. */
    public static StoryDetailResponse from(StoryDetail s, List<GenreRef> genres, List<Tag> tags,
            List<VolumeToc> volumes, List<ChapterToc> looseChapters) {
        return new StoryDetailResponse(s.getStoryId(), s.getSlug(), s.getTitle(), s.getDescription(), s.getCoverUrl(),
                Author.from(s.getAuthor()), s.getCompletionStatus(), s.getAgeRating(),
                s.getChapterCount(), s.getWordCount(), s.getViewCount(), s.getFollowCount(),
                s.getRatingAvg(), s.getRatingCount(),
                Times.utc(s.getLastChapterAt()), Times.utc(s.getPublishedAt()),
                genres.stream().map(Genre::from).toList(),
                tags.stream().map(TagItem::from).toList(),
                volumes.stream().map(Volume::from).toList(),
                looseChapters.stream().map(Chapter::from).toList());
    }
}
