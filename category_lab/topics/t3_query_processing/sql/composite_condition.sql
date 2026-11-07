-- Query type (e): several conditions. F2 search: public, completed stories with a minimum rating and
-- chapter count, best rated first, first page of 20 (the web pages with OFFSET ... FETCH).
-- {table} is replaced by the scenario (a 150 / 1k / 10k copy of dbo.Story with the web's indexes).
SELECT StoryId, Title, Slug, RatingAvg, ChapterCount
FROM {table}
WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0
  AND CompletionStatus = ? AND RatingAvg >= ? AND ChapterCount >= ?
ORDER BY RatingAvg DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
