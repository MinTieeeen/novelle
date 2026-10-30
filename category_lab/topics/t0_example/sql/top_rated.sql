SELECT TOP (10) StoryId, Title, RatingAvg
FROM dbo.Story
WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0
ORDER BY RatingAvg DESC, StoryId
