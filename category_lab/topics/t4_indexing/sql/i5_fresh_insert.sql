-- I5 freshness: a new story whose title holds a word no other story has (parameter), copied from story 1.
-- Runs on the topic's full-text copy only. The scenario then polls CONTAINSTABLE until the word is found.
INSERT INTO {table} (StoryId, SourceStoryId, AuthorId, Title, Slug, Description, CoverUrl, AgeRating,
                     CompletionStatus, PublishStatus, ChapterCount, WordCount, ViewCount, FollowCount,
                     RatingAvg, RatingCount, LastChapterAt, PublishedAt, IsDeleted, CreatedAt, UpdatedAt)
SELECT (SELECT MAX(StoryId) + 1 FROM {table}), SourceStoryId, AuthorId, ?, Slug + '--fresh', Description,
       CoverUrl, AgeRating, CompletionStatus, PublishStatus, ChapterCount, WordCount, ViewCount, FollowCount,
       RatingAvg, RatingCount, LastChapterAt, PublishedAt, IsDeleted, CreatedAt, UpdatedAt
FROM {table}
WHERE StoryId = 1;
