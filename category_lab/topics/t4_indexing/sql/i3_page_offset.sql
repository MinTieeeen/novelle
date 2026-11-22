-- I3 (F1 "recently updated"): public stories that have a chapter, newest first, one page of 20.
-- Literal status predicates, like vw_PublicStory. StoryId breaks ties so every page is deterministic.
SELECT StoryId, Title, ChapterCount, LastChapterAt
FROM {table}
WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0 AND LastChapterAt IS NOT NULL
ORDER BY LastChapterAt DESC, StoryId DESC
OFFSET ? ROWS FETCH NEXT 20 ROWS ONLY
