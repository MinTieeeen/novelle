/*
 * 04_views.sql   [RDS OK]
 *
 * vw_PublicStory  - the only way the public side reads stories: drafts, hidden and deleted
 *                   stories never appear (RB3).
 * vw_AuthorStats  - one row per author, for the author dashboard (F10) and admin dashboard (F13).
 * CREATE OR ALTER, so this file can be re-run whenever a view changes.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

CREATE OR ALTER VIEW dbo.vw_PublicStory
AS
SELECT s.StoryId,
       s.AuthorId,
       a.PenName AS AuthorName,
       s.Title,
       s.Slug,
       s.Description,
       s.CoverUrl,
       s.AgeRating,
       s.CompletionStatus,
       s.ChapterCount,
       s.WordCount,
       s.ViewCount,
       s.FollowCount,
       s.RatingAvg,
       s.RatingCount,
       s.LastChapterAt,
       s.PublishedAt,
       s.CreatedAt,
       s.UpdatedAt
FROM dbo.Story s
JOIN dbo.Author a ON a.UserId = s.AuthorId
WHERE s.PublishStatus = 'PUBLISHED'
  AND s.IsDeleted = 0;
GO

CREATE OR ALTER VIEW dbo.vw_AuthorStats
AS
SELECT a.UserId        AS AuthorId,
       a.PenName,
       a.IsVerified,
       a.FollowerCount,
       COUNT(s.StoryId)                                              AS StoryCount,
       COUNT(CASE WHEN s.PublishStatus = 'PUBLISHED' THEN 1 END)     AS PublishedStoryCount,
       COALESCE(SUM(CAST(s.ChapterCount AS BIGINT)), 0)              AS ChapterCount,
       COALESCE(SUM(s.WordCount), 0)                                 AS WordCount,
       COALESCE(SUM(s.ViewCount), 0)                                 AS ViewCount,
       COALESCE(SUM(CAST(s.FollowCount AS BIGINT)), 0)               AS StoryFollowCount,
       COALESCE(SUM(CAST(s.RatingCount AS BIGINT)), 0)               AS RatingCount,
       -- average over all ratings of all the author's stories (weighted by RatingCount)
       COALESCE(CAST(SUM(CAST(s.RatingAvg AS DECIMAL(18,4)) * s.RatingCount)
                     / NULLIF(SUM(CAST(s.RatingCount AS DECIMAL(18,4))), 0) AS DECIMAL(3,2)), 0) AS RatingAvg
FROM dbo.Author a
LEFT JOIN dbo.Story s ON s.AuthorId = a.UserId AND s.IsDeleted = 0
GROUP BY a.UserId, a.PenName, a.IsVerified, a.FollowerCount;
GO
