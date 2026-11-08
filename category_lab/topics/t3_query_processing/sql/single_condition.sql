-- Query type (d): one condition. F3 author page: the stories of one author, latest update first.
-- {table} is replaced by the scenario (a 150 / 1k / 10k copy of dbo.Story with the web's indexes).
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, RatingAvg, LastChapterAt
FROM {table}
WHERE AuthorId = ?
ORDER BY LastChapterAt DESC
