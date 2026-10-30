/*
 * 06_triggers.sql   [RDS OK]
 *
 * Table-level triggers only (server-level triggers are not available on RDS).
 * Every trigger handles SETS of rows: inserted / deleted may contain many rows or none.
 *
 * Derived-value triggers   trg_Rating, trg_Follow, trg_AuthorFollow   (data-dictionary section 5)
 * trg_Chapter_Revision     snapshots the previous version of a chapter when its title or content changes
 * trg_ChapterRevision_Immutable   ChapterRevision is append-only (RB10)
 * trg_Chapter_VolumeSameStory     a chapter's volume must belong to the same story (RB7)
 *
 * CONTRACT with the backend: before it UPDATEs the title or content of a chapter it must run, on the SAME
 * connection and in the same transaction scope:
 *     EXEC sp_set_session_context @key = N'user_id', @value = <editing author's UserId>;
 * trg_Chapter_Revision stores that id as ChapterRevision.EditedBy and raises error 50005 if it is missing.
 *
 * Triggers that raise an error use XACT_ABORT ON plus an explicit ROLLBACK before THROW, so the
 * offending statement is never left half-applied inside an outer transaction.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ---------- Story.RatingAvg / RatingCount ---------- */
CREATE OR ALTER TRIGGER dbo.trg_Rating
ON dbo.Rating
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    UPDATE s
    SET RatingAvg   = COALESCE(x.AvgScore, 0),
        RatingCount = COALESCE(x.RatingCount, 0)
    FROM dbo.Story s
    JOIN (SELECT StoryId FROM inserted UNION SELECT StoryId FROM deleted) t ON t.StoryId = s.StoryId
    OUTER APPLY (SELECT CAST(AVG(CAST(r.Score AS DECIMAL(5,2))) AS DECIMAL(3,2)) AS AvgScore,
                        COUNT(*)                                                 AS RatingCount
                 FROM dbo.Rating r
                 WHERE r.StoryId = s.StoryId) x;
END
GO

/* ---------- Story.FollowCount ---------- */
CREATE OR ALTER TRIGGER dbo.trg_Follow
ON dbo.Follow
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    UPDATE s
    SET FollowCount = (SELECT COUNT(*) FROM dbo.Follow f WHERE f.StoryId = s.StoryId)
    FROM dbo.Story s
    JOIN (SELECT StoryId FROM inserted UNION SELECT StoryId FROM deleted) t ON t.StoryId = s.StoryId;
END
GO

/* ---------- Author.FollowerCount ---------- */
CREATE OR ALTER TRIGGER dbo.trg_AuthorFollow
ON dbo.AuthorFollow
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    UPDATE a
    SET FollowerCount = (SELECT COUNT(*) FROM dbo.AuthorFollow af WHERE af.AuthorId = a.UserId)
    FROM dbo.Author a
    JOIN (SELECT AuthorId FROM inserted UNION SELECT AuthorId FROM deleted) t ON t.AuthorId = a.UserId;
END
GO

/* ---------- ChapterRevision append-only (RB10) ---------- */
-- UPDATE is always refused. DELETE is refused too, except the housekeeping done by
-- trg_Chapter_Revision, which raises the session flag `revision_cleanup` for the duration of its DELETE.
CREATE OR ALTER TRIGGER dbo.trg_ChapterRevision_Immutable
ON dbo.ChapterRevision
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;      -- statement touched no rows

    IF NOT EXISTS (SELECT 1 FROM inserted)             -- DELETE
       AND TRY_CAST(SESSION_CONTEXT(N'revision_cleanup') AS INT) = 1
    BEGIN
        DELETE r
        FROM dbo.ChapterRevision r
        JOIN deleted d ON d.RevisionId = r.RevisionId;
        RETURN;
    END

    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW 50006, N'ChapterRevision is append-only: rows cannot be updated or deleted.', 1;
END
GO

/* ---------- chapter edit history ---------- */
-- Fires when the title or content actually changes (compared with a binary collation, because the
-- database collation ignores case and accents). The row stored is the version BEFORE the edit;
-- EditedBy is the author who made the edit. Only the 10 newest revisions per chapter are kept.
CREATE OR ALTER TRIGGER dbo.trg_Chapter_Revision
ON dbo.Chapter
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF NOT (UPDATE(Title) OR UPDATE(Content)) RETURN;

    IF NOT EXISTS (SELECT 1
                   FROM inserted i
                   JOIN deleted d ON d.ChapterId = i.ChapterId
                   WHERE i.Title   COLLATE Latin1_General_100_BIN2 <> d.Title   COLLATE Latin1_General_100_BIN2
                      OR i.Content COLLATE Latin1_General_100_BIN2 <> d.Content COLLATE Latin1_General_100_BIN2)
        RETURN;

    DECLARE @EditorId INT = TRY_CAST(SESSION_CONTEXT(N'user_id') AS INT);
    IF @EditorId IS NULL
    BEGIN
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW 50005, N'SESSION_CONTEXT user_id is required to edit chapter title or content.', 1;
    END

    INSERT dbo.ChapterRevision (ChapterId, RevisionNo, Title, Content, WordCount, EditedBy)
    SELECT d.ChapterId,
           COALESCE(m.MaxNo, 0) + 1,
           d.Title, d.Content, d.WordCount, @EditorId
    FROM deleted d
    JOIN inserted i ON i.ChapterId = d.ChapterId
    OUTER APPLY (SELECT MAX(r.RevisionNo) AS MaxNo
                 FROM dbo.ChapterRevision r WITH (UPDLOCK, HOLDLOCK)
                 WHERE r.ChapterId = d.ChapterId) m
    WHERE i.Title   COLLATE Latin1_General_100_BIN2 <> d.Title   COLLATE Latin1_General_100_BIN2
       OR i.Content COLLATE Latin1_General_100_BIN2 <> d.Content COLLATE Latin1_General_100_BIN2;

    -- keep the 10 newest revisions per chapter; the flag lets this DELETE through the immutable trigger
    EXEC sys.sp_set_session_context @key = N'revision_cleanup', @value = 1;
    BEGIN TRY
        ;WITH ranked AS (
            SELECT RevisionId,
                   ROW_NUMBER() OVER (PARTITION BY ChapterId ORDER BY RevisionNo DESC) AS rn
            FROM dbo.ChapterRevision
            WHERE ChapterId IN (SELECT ChapterId FROM inserted)
        )
        DELETE FROM ranked WHERE rn > 10;
    END TRY
    BEGIN CATCH
        EXEC sys.sp_set_session_context @key = N'revision_cleanup', @value = 0;
        THROW;
    END CATCH
    EXEC sys.sp_set_session_context @key = N'revision_cleanup', @value = 0;
END
GO

/* ---------- RB7: a chapter's volume must belong to the same story ---------- */
CREATE OR ALTER TRIGGER dbo.trg_Chapter_VolumeSameStory
ON dbo.Chapter
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF (UPDATE(VolumeId) OR UPDATE(StoryId))
       AND EXISTS (SELECT 1
                   FROM inserted i
                   JOIN dbo.Volume v ON v.VolumeId = i.VolumeId
                   WHERE v.StoryId <> i.StoryId)
    BEGIN
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW 50007, N'The volume belongs to a different story than the chapter.', 1;
    END
END
GO
