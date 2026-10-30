/*
 * 90_finalize.sql   [RDS OK]   Seed last step.
 *
 * Computes the derived columns that no trigger maintains (data-dictionary section 5), checks the ones
 * the triggers maintained, drops the helper schema `seed` and prints the row counts.
 *
 *   Story.ChapterCount / WordCount / LastChapterAt   from the PUBLISHED, not deleted chapters
 *   Story.ViewCount     3 x the sum of the last 90 days in StoryViewDaily (the history before those 90 days)
 *   Chapter.ViewCount   the story's views spread over its chapters, earlier chapters read more
 *   Tag.UsageCount, ReadingList.ItemCount
 *   Story.UpdatedAt     the later of CreatedAt and LastChapterAt
 *
 * Afterwards run queries/99_check_invariants.sql: it must return no rows.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE s
SET ChapterCount  = x.Cnt,
    WordCount     = x.Words,
    LastChapterAt = x.LastAt
FROM dbo.Story s
CROSS APPLY (SELECT COUNT(*)                                       AS Cnt,
                    COALESCE(SUM(CAST(c.WordCount AS BIGINT)), 0)  AS Words,
                    MAX(c.PublishedAt)                             AS LastAt
             FROM dbo.Chapter c
             WHERE c.StoryId = s.StoryId AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0) x;

UPDATE s
SET ViewCount = 3 * CAST(COALESCE(v.Total, 0) AS BIGINT)
FROM dbo.Story s
OUTER APPLY (SELECT SUM(CAST(d.Views AS BIGINT)) AS Total FROM dbo.StoryViewDaily d WHERE d.StoryId = s.StoryId) v;

-- weight 1.6 for the first chapter down to about 0.4 for the last one: the average weight is 1
UPDATE c
SET ViewCount = CAST(ROUND(s.ViewCount * (1.6 - 1.2 * (c.ChapterNo - 1.0) / s.ChapterCount) / s.ChapterCount, 0) AS BIGINT)
FROM dbo.Chapter c
JOIN dbo.Story s ON s.StoryId = c.StoryId
WHERE c.Status = 'PUBLISHED' AND c.IsDeleted = 0 AND s.ChapterCount > 0;

UPDATE t
SET UsageCount = (SELECT COUNT(*) FROM dbo.StoryTag st WHERE st.TagId = t.TagId)
FROM dbo.Tag t;

UPDATE l
SET ItemCount = (SELECT COUNT(*) FROM dbo.ReadingListItem i WHERE i.ListId = l.ListId)
FROM dbo.ReadingList l;

UPDATE dbo.Story
SET UpdatedAt = CASE WHEN LastChapterAt IS NOT NULL AND LastChapterAt > CreatedAt THEN LastChapterAt ELSE CreatedAt END;
GO

/* ---------- the values the triggers kept must equal a recomputation ---------- */
IF EXISTS (SELECT 1 FROM dbo.Story s
           WHERE s.FollowCount <> (SELECT COUNT(*) FROM dbo.Follow f WHERE f.StoryId = s.StoryId)
              OR s.RatingCount <> (SELECT COUNT(*) FROM dbo.Rating r WHERE r.StoryId = s.StoryId))
   OR EXISTS (SELECT 1 FROM dbo.Author a
              WHERE a.FollowerCount <> (SELECT COUNT(*) FROM dbo.AuthorFollow af WHERE af.AuthorId = a.UserId))
    THROW 50123, N'90_finalize: counters kept by triggers differ from a recomputation.', 1;
GO

/* ---------- drop the helper schema ---------- */
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql += N'DROP TABLE seed.' + QUOTENAME(name) + N';' FROM sys.tables  WHERE schema_id = SCHEMA_ID(N'seed');
SELECT @sql += N'DROP FUNCTION seed.' + QUOTENAME(name) + N';' FROM sys.objects WHERE schema_id = SCHEMA_ID(N'seed') AND type = 'IF';
EXEC (@sql);
IF SCHEMA_ID(N'seed') IS NOT NULL DROP SCHEMA seed;
GO

/* ---------- report ---------- */
SELECT t.name AS TableName, SUM(p.rows) AS Rows
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.schema_id = SCHEMA_ID(N'dbo')
GROUP BY t.name
ORDER BY t.name;
GO

EXEC sp_spaceused;
GO
