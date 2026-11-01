SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, ViewCount, RatingAvg, RatingCount
FROM dbo.Story
WHERE StoryId = ?
