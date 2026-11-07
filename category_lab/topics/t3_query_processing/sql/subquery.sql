-- Query type (g): subquery. F1 home page block "standout stories": public stories rated higher than the
-- average of the same author's public stories, best rated first, first page of 20.
-- The subquery is correlated: it depends on the author of the outer row (s.AuthorId).
-- {story} is replaced by the scenario (a 150 / 1k / 10k copy of dbo.Story with the web's indexes).
SELECT s.StoryId, s.Title, s.Slug, s.AuthorId, s.RatingAvg
FROM {story} s
WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0
  AND s.RatingAvg > (SELECT AVG(s2.RatingAvg)
                     FROM {story} s2
                     WHERE s2.AuthorId = s.AuthorId
                       AND s2.PublishStatus = 'PUBLISHED' AND s2.IsDeleted = 0)
ORDER BY s.RatingAvg DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
