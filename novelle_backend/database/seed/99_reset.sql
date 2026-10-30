/*
 * 99_reset.sql   [RDS OK]
 *
 * Deletes ALL data (every table except Genre) and restarts the IDENTITY counters, so the seed scripts can
 * be run again. It also removes any `seed` helper objects left over by a failed run.
 * Restoring the RDS snapshot taken before seeding does the same thing, faster.
 *
 * Dangerous, so it needs an explicit switch:
 *   sqlcmd ... -f 65001 -v CONFIRM=YES -i 99_reset.sql
 *
 * Everything after the check is ONE batch, so a failed check stops the whole script even without -b.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF N'$(CONFIRM)' <> N'YES'
    THROW 50101, N'99_reset.sql deletes all data. Run it again with -v CONFIRM=YES.', 1;

-- ChapterRevision is append-only; the housekeeping flag lets this DELETE through trg_ChapterRevision_Immutable
EXEC sys.sp_set_session_context @key = N'revision_cleanup', @value = 1;
DELETE FROM dbo.ChapterRevision;
EXEC sys.sp_set_session_context @key = N'revision_cleanup', @value = 0;

DELETE FROM dbo.StoryViewDaily;
DELETE FROM dbo.ReadingListItem;
DELETE FROM dbo.ReadingList;
DELETE FROM dbo.ReadingHistory;
DELETE FROM dbo.Follow;
DELETE FROM dbo.Rating;
DELETE FROM dbo.AuthorFollow;
DELETE FROM dbo.StoryTag;
DELETE FROM dbo.StoryGenre;
DELETE FROM dbo.Chapter;
DELETE FROM dbo.Volume;
DELETE FROM dbo.Story;
DELETE FROM dbo.Author;
DELETE FROM dbo.AuthorRequest;
DELETE FROM dbo.[User];
DELETE FROM dbo.Tag;

DBCC CHECKIDENT (N'dbo.[User]',          RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.AuthorRequest',   RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.Tag',             RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.Story',           RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.Volume',          RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.Chapter',         RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.ChapterRevision', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT (N'dbo.ReadingList',     RESEED, 0) WITH NO_INFOMSGS;

-- helper objects of an interrupted seed run
IF SCHEMA_ID(N'seed') IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql += N'DROP TABLE seed.' + QUOTENAME(name) + N';' FROM sys.tables  WHERE schema_id = SCHEMA_ID(N'seed');
    SELECT @sql += N'DROP FUNCTION seed.' + QUOTENAME(name) + N';' FROM sys.objects WHERE schema_id = SCHEMA_ID(N'seed') AND type = 'IF';
    EXEC (@sql);
    DROP SCHEMA seed;
END

SELECT t.name AS TableName, SUM(p.rows) AS Rows
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.schema_id = SCHEMA_ID(N'dbo')
GROUP BY t.name
HAVING SUM(p.rows) > 0
ORDER BY t.name;     -- only Genre (20 rows) should remain
GO
