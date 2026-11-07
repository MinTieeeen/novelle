-- Query type (f): join. F2 genre page: the public stories of one genre with the author's pen name,
-- latest update first, first page of 20.
-- {story}, {author}, {story_genre} are replaced by the scenario (150 / 1k / 10k copies with the web's
-- indexes); dbo.Genre is small and does not grow, so it is read as is.
SELECT s.StoryId, s.Title, s.Slug, s.LastChapterAt, a.PenName, g.Name AS GenreName
FROM dbo.Genre g
JOIN {story_genre} sg ON sg.GenreId = g.GenreId
JOIN {story} s        ON s.StoryId = sg.StoryId
JOIN {author} a       ON a.UserId = s.AuthorId
WHERE g.Slug = ?
  AND s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0
ORDER BY s.LastChapterAt DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
