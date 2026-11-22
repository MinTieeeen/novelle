-- I3 keyset ("seek") paging: the next 20 rows after the last row of the previous page (@t, @id) instead of
-- skipping OFFSET rows. Parameters: LastChapterAt and StoryId of that row; @t is given twice.
SELECT TOP (20) StoryId, Title, ChapterCount, LastChapterAt
FROM {table}
WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND LastChapterAt IS NOT NULL
  AND (LastChapterAt < ? OR (LastChapterAt = ? AND StoryId < ?))
ORDER BY LastChapterAt DESC, StoryId DESC
