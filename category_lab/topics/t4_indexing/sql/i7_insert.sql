-- I7: insert one new story (a copy of story ?), the way an author creates one. Every nonclustered index of the
-- table gets one new entry (the filtered one only if the copied story is public).
-- Repeatable: the id is MAX + 1 and the slug carries it, so UX_Slug never rejects a repeat.
-- {table} = the topic's writable copy (StoryW_<n>); the scenario deletes the inserted rows afterwards.
INSERT INTO {table} (StoryId, SourceStoryId, AuthorId, Title, Slug, Description, CoverUrl, AgeRating,
                     CompletionStatus, PublishStatus, ChapterCount, WordCount, ViewCount, FollowCount,
                     RatingAvg, RatingCount, LastChapterAt, PublishedAt, IsDeleted, CreatedAt, UpdatedAt)
SELECT x.NewId, s.SourceStoryId, s.AuthorId, s.Title, CAST(s.Slug + '--ins' + CAST(x.NewId AS VARCHAR(12)) AS VARCHAR(350)),
       s.Description, s.CoverUrl, s.AgeRating, s.CompletionStatus, s.PublishStatus, s.ChapterCount, s.WordCount,
       s.ViewCount, s.FollowCount, s.RatingAvg, s.RatingCount, s.LastChapterAt, s.PublishedAt, s.IsDeleted,
       s.CreatedAt, s.UpdatedAt
FROM {table} s
CROSS JOIN (SELECT MAX(StoryId) + 1 AS NewId FROM {table}) x
WHERE s.StoryId = ?
