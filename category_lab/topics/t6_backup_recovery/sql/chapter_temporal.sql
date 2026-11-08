-- {table}: system-versioned (temporal) copy of dbo.Chapter for a few stories; {history}: its history table.
-- Every UPDATE / DELETE keeps the old row version in {history}, so rows can be read "AS OF" a past time.
DROP TABLE IF EXISTS {table};
DROP TABLE IF EXISTS {history};
GO
CREATE TABLE {table} (
    ChapterId bigint        NOT NULL PRIMARY KEY CLUSTERED,
    StoryId   int           NOT NULL,
    ChapterNo int           NOT NULL,
    Title     nvarchar(300) NOT NULL,
    Content   nvarchar(max) NOT NULL,
    WordCount int           NOT NULL,
    ValidFrom datetime2(7) GENERATED ALWAYS AS ROW START NOT NULL,
    ValidTo   datetime2(7) GENERATED ALWAYS AS ROW END   NOT NULL,
    PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo)
) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = {history}));
GO
INSERT INTO {table} (ChapterId, StoryId, ChapterNo, Title, Content, WordCount)
SELECT c.ChapterId, c.StoryId, c.ChapterNo, c.Title, c.Content, c.WordCount
FROM dbo.Chapter AS c
WHERE c.StoryId IN (SELECT TOP ({stories}) StoryId FROM dbo.Chapter GROUP BY StoryId ORDER BY COUNT(*) DESC, StoryId);
