/*
 * dataset_story.sql   builds {story}: dbo.Story grown to {n} rows, clustered primary key ONLY.
 *
 * Placeholders filled by dataset.py: {story} (table name), {pk} (constraint name), {n} (row count).
 * Copy rules (the same as copies.py, which builds the Redis side): see copies.py.
 * dbo.Story and dbo.Author are only read. SELECT TOP (0) ... INTO keeps the column types and collations
 * of dbo.Story (Vietnamese_100_CI_AI), which LIKE and full-text depend on.
 */
DROP TABLE IF EXISTS {story};
SELECT TOP (0)
       CAST(0 AS INT)                    AS StoryId,
       s.StoryId + 0                     AS SourceStoryId,
       s.AuthorId + 0                    AS AuthorId,
       CAST(s.Title AS NVARCHAR(300))    AS Title,
       CAST(s.Slug AS VARCHAR(350))      AS Slug,
       s.Description, s.CoverUrl, s.AgeRating, s.CompletionStatus, s.PublishStatus,
       s.ChapterCount, s.WordCount, s.ViewCount, s.FollowCount, s.RatingAvg, s.RatingCount,
       s.LastChapterAt, s.PublishedAt, s.IsDeleted, s.CreatedAt, s.UpdatedAt
INTO {story}
FROM dbo.Story s;
GO
ALTER TABLE {story} ALTER COLUMN StoryId INT NOT NULL;
GO
ALTER TABLE {story} ADD CONSTRAINT {pk} PRIMARY KEY CLUSTERED (StoryId);
GO
-- One INSERT per copy of the ~150 original rows: no sort, no memory grant (the instance has very little).
SET NOCOUNT ON;
DECLARE @copy INT = 1,
        @base INT = (SELECT COUNT(*) FROM dbo.Story),
        @authors INT = (SELECT MAX(UserId) FROM dbo.Author);
WHILE (@copy - 1) * @base < {n}
BEGIN
    INSERT INTO {story} (StoryId, SourceStoryId, AuthorId, Title, Slug, Description, CoverUrl, AgeRating,
                         CompletionStatus, PublishStatus, ChapterCount, WordCount, ViewCount, FollowCount,
                         RatingAvg, RatingCount, LastChapterAt, PublishedAt, IsDeleted, CreatedAt, UpdatedAt)
    SELECT x.NewId, x.StoryId, x.AuthorId + (@copy - 1) * @authors,
           CAST(x.Title + IIF(@copy > 1, N' #' + CAST(@copy AS NVARCHAR(10)), N'') AS NVARCHAR(300)),
           -- "--copy<k>": a plain "-<k>" could collide with a real slug such as "some-title-2"
           CAST(x.Slug + IIF(@copy > 1, '--copy' + CAST(@copy AS VARCHAR(10)), '') AS VARCHAR(350)),
           x.Description, x.CoverUrl, x.AgeRating, x.CompletionStatus, x.PublishStatus,
           x.ChapterCount, x.WordCount, x.ViewCount, x.FollowCount, x.RatingAvg, x.RatingCount,
           DATEADD(MILLISECOND, -(@copy - 1), x.LastChapterAt),
           x.PublishedAt, x.IsDeleted, x.CreatedAt, x.UpdatedAt
    FROM (SELECT s.*, (@copy - 1) * @base + CAST(ROW_NUMBER() OVER (ORDER BY s.StoryId) AS INT) AS NewId
          FROM dbo.Story s) x
    WHERE x.NewId <= {n};
    SET @copy += 1;
END
