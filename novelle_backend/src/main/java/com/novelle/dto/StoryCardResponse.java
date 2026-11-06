package com.novelle.dto;

import java.math.BigDecimal;
import java.time.Instant;

import com.novelle.model.AuthorRef;
import com.novelle.model.GenreRef;
import com.novelle.model.StoryCard;

/** A public story in a list (home blocks, search results, author page); {@code description} ≤ 300 chars. */
public record StoryCardResponse(
        int storyId,
        String slug,
        String title,
        String description,
        String coverUrl,
        Author author,
        Genre primaryGenre,
        String completionStatus,
        String ageRating,
        int chapterCount,
        long viewCount,
        int followCount,
        BigDecimal ratingAvg,
        int ratingCount,
        Instant lastChapterAt,
        Instant publishedAt) {

    public record Author(int authorId, String penName) {

        static Author from(AuthorRef a) {
            return a == null ? null : new Author(a.getAuthorId(), a.getPenName());
        }
    }

    public record Genre(int genreId, String name, String slug) {

        static Genre from(GenreRef g) {
            return g == null ? null : new Genre(g.getGenreId(), g.getName(), g.getSlug());
        }
    }

    public static StoryCardResponse from(StoryCard s) {
        return new StoryCardResponse(s.getStoryId(), s.getSlug(), s.getTitle(), s.getDescription(), s.getCoverUrl(),
                Author.from(s.getAuthor()), Genre.from(s.getPrimaryGenre()),
                s.getCompletionStatus(), s.getAgeRating(), s.getChapterCount(), s.getViewCount(),
                s.getFollowCount(), s.getRatingAvg(), s.getRatingCount(),
                Times.utc(s.getLastChapterAt()), Times.utc(s.getPublishedAt()));
    }
}
