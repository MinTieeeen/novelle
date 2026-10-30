/*
 * 05_procedures.sql   [RDS OK]
 *
 * Stored procedures (CREATE OR ALTER) and the table type used by sp_FlushViews.
 * Every procedure: SET XACT_ABORT ON, BEGIN TRY / CATCH, rolls back and re-throws.
 *
 * Error numbers raised with THROW (the backend maps them to HTTP status codes):
 *   50001  already processed / already published          -> 409
 *   50002  not allowed for this user or state             -> 403
 *   50003  pen name already in use                        -> 409
 *   50004  row not found                                  -> 404
 *   50005  SESSION_CONTEXT user_id missing (trigger)      -> 500 (bug in the caller)
 *   50006  ChapterRevision is append-only (trigger)       -> 500
 *   50007  volume belongs to another story (trigger)      -> 409
 *
 * Procedures: sp_ApproveAuthorRequest, sp_RejectAuthorRequest, sp_RecalcStoryStats,
 *             sp_PublishChapter, sp_PublishScheduled, sp_DeleteStory, sp_FlushViews.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ---------- table type for sp_FlushViews ---------- */

IF TYPE_ID(N'dbo.ViewDeltaTable') IS NULL
CREATE TYPE dbo.ViewDeltaTable AS TABLE (
    TargetType  CHAR(1) NOT NULL,          -- 'S' = story, 'C' = chapter
    TargetId    BIGINT  NOT NULL,          -- StoryId or ChapterId
    ViewDate    DATE    NOT NULL,          -- calendar day in Vietnam time
    Delta       INT     NOT NULL CHECK (Delta > 0),
    PRIMARY KEY (TargetType, TargetId, ViewDate)
);
GO

/* ---------- F11: approve an author request (RB15) ---------- */
-- Two admins can race on the same request: the row is read with UPDLOCK, HOLDLOCK, so the second
-- caller waits for the first and then sees Status <> 'PENDING' and gets error 50001.
CREATE OR ALTER PROCEDURE dbo.sp_ApproveAuthorRequest
    @RequestId INT,
    @AdminId   INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @UserId INT, @PenName NVARCHAR(100), @Status VARCHAR(10);

        SELECT @UserId = UserId, @PenName = ProposedPenName, @Status = Status
        FROM dbo.AuthorRequest WITH (UPDLOCK, HOLDLOCK)
        WHERE RequestId = @RequestId;

        IF @@ROWCOUNT = 0
            THROW 50004, N'Author request not found.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserId = @AdminId AND Role = 'ADMIN' AND Status = 'ACTIVE')
            THROW 50002, N'Only an active ADMIN can review author requests.', 1;

        IF @Status <> 'PENDING'
            THROW 50001, N'Author request was already processed.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.[User] WITH (UPDLOCK) WHERE UserId = @UserId AND Role = 'READER' AND Status = 'ACTIVE')
            THROW 50002, N'The applicant is not an active READER.', 1;

        IF EXISTS (SELECT 1 FROM dbo.Author WITH (UPDLOCK, HOLDLOCK) WHERE PenName = @PenName)
            THROW 50003, N'Pen name is already in use.', 1;

        UPDATE dbo.AuthorRequest
        SET Status = 'APPROVED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME()
        WHERE RequestId = @RequestId;

        UPDATE dbo.[User]
        SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME()
        WHERE UserId = @UserId;

        INSERT dbo.Author (UserId, PenName, ApprovedRequestId)
        VALUES (@UserId, @PenName, @RequestId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------- F11: reject an author request (RB15) ---------- */
CREATE OR ALTER PROCEDURE dbo.sp_RejectAuthorRequest
    @RequestId INT,
    @AdminId   INT,
    @Note      NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Status VARCHAR(10);

        SELECT @Status = Status
        FROM dbo.AuthorRequest WITH (UPDLOCK, HOLDLOCK)
        WHERE RequestId = @RequestId;

        IF @@ROWCOUNT = 0
            THROW 50004, N'Author request not found.', 1;

        IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserId = @AdminId AND Role = 'ADMIN' AND Status = 'ACTIVE')
            THROW 50002, N'Only an active ADMIN can review author requests.', 1;

        IF @Status <> 'PENDING'
            THROW 50001, N'Author request was already processed.', 1;

        UPDATE dbo.AuthorRequest
        SET Status = 'REJECTED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME(), ReviewNote = @Note
        WHERE RequestId = @RequestId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------- helper: recompute the derived chapter columns of one story ---------- */
-- Story.ChapterCount, WordCount, LastChapterAt = formulas of data-dictionary section 5.
-- The service also calls this after deleting or editing a published chapter.
CREATE OR ALTER PROCEDURE dbo.sp_RecalcStoryStats
    @StoryId INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE s
    SET ChapterCount  = x.ChapterCount,
        WordCount     = x.WordCount,
        LastChapterAt = x.LastChapterAt,
        UpdatedAt     = SYSUTCDATETIME()
    FROM dbo.Story s
    CROSS APPLY (SELECT COUNT(*)                              AS ChapterCount,
                        COALESCE(SUM(CAST(c.WordCount AS BIGINT)), 0) AS WordCount,
                        MAX(c.PublishedAt)                    AS LastChapterAt
                 FROM dbo.Chapter c
                 WHERE c.StoryId = s.StoryId AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0) x
    WHERE s.StoryId = @StoryId;
END
GO

/* ---------- F9: publish a chapter now (RB9) ---------- */
CREATE OR ALTER PROCEDURE dbo.sp_PublishChapter
    @ChapterId BIGINT,
    @UserId    INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @StoryId INT, @OwnerId INT, @Status VARCHAR(10), @Now DATETIME2(3) = SYSUTCDATETIME();

        SELECT @StoryId = c.StoryId, @Status = c.Status, @OwnerId = s.AuthorId
        FROM dbo.Chapter c WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.Story s ON s.StoryId = c.StoryId
        WHERE c.ChapterId = @ChapterId AND c.IsDeleted = 0 AND s.IsDeleted = 0;

        IF @@ROWCOUNT = 0
            THROW 50004, N'Chapter not found.', 1;

        IF @OwnerId <> @UserId
           OR NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserId = @UserId AND Role = 'AUTHOR' AND Status = 'ACTIVE')
            THROW 50002, N'Only the active AUTHOR who owns the story can publish its chapters.', 1;

        IF @Status = 'PUBLISHED'
            THROW 50001, N'Chapter is already published.', 1;

        UPDATE dbo.Chapter
        SET Status = 'PUBLISHED', PublishedAt = @Now, UpdatedAt = @Now
        WHERE ChapterId = @ChapterId;

        EXEC dbo.sp_RecalcStoryStats @StoryId = @StoryId;

        -- first public chapter of the story
        UPDATE dbo.Story
        SET PublishedAt = COALESCE(PublishedAt, @Now)
        WHERE StoryId = @StoryId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------- RB11: publish all chapters whose time has come (called every minute by the backend) ---------- */
-- READPAST: if two runs overlap, the second skips chapters the first is already publishing.
-- Returns one row with the number of chapters published.
CREATE OR ALTER PROCEDURE dbo.sp_PublishScheduled
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
        DECLARE @Due TABLE (ChapterId BIGINT NOT NULL PRIMARY KEY, StoryId INT NOT NULL);

        INSERT @Due (ChapterId, StoryId)
        SELECT c.ChapterId, c.StoryId
        FROM dbo.Chapter c WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE c.Status = 'SCHEDULED' AND c.IsDeleted = 0 AND c.ScheduledAt <= @Now;

        UPDATE c
        SET Status = 'PUBLISHED', PublishedAt = @Now, UpdatedAt = @Now
        FROM dbo.Chapter c
        JOIN @Due d ON d.ChapterId = c.ChapterId;

        UPDATE s
        SET ChapterCount  = x.ChapterCount,
            WordCount     = x.WordCount,
            LastChapterAt = x.LastChapterAt,
            PublishedAt   = COALESCE(s.PublishedAt, @Now),
            UpdatedAt     = @Now
        FROM dbo.Story s
        JOIN (SELECT DISTINCT StoryId FROM @Due) st ON st.StoryId = s.StoryId
        CROSS APPLY (SELECT COUNT(*)                              AS ChapterCount,
                            COALESCE(SUM(CAST(c.WordCount AS BIGINT)), 0) AS WordCount,
                            MAX(c.PublishedAt)                    AS LastChapterAt
                     FROM dbo.Chapter c
                     WHERE c.StoryId = s.StoryId AND c.Status = 'PUBLISHED' AND c.IsDeleted = 0) x;

        DECLARE @Published INT = (SELECT COUNT(*) FROM @Due);

        COMMIT TRANSACTION;

        SELECT @Published AS PublishedCount;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------- F8, F12: soft-delete a story ---------- */
-- Allowed for the owner (AUTHOR) or an ADMIN.
CREATE OR ALTER PROCEDURE dbo.sp_DeleteStory
    @StoryId INT,
    @UserId  INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @OwnerId INT;

        SELECT @OwnerId = AuthorId
        FROM dbo.Story WITH (UPDLOCK, HOLDLOCK)
        WHERE StoryId = @StoryId AND IsDeleted = 0;

        IF @@ROWCOUNT = 0
            THROW 50004, N'Story not found.', 1;

        IF NOT (   (@OwnerId = @UserId AND EXISTS (SELECT 1 FROM dbo.[User] WHERE UserId = @UserId AND Role = 'AUTHOR' AND Status = 'ACTIVE'))
                OR EXISTS (SELECT 1 FROM dbo.[User] WHERE UserId = @UserId AND Role = 'ADMIN' AND Status = 'ACTIVE'))
            THROW 50002, N'Only the owner or an ADMIN can delete this story.', 1;

        UPDATE dbo.Story
        SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
        WHERE StoryId = @StoryId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------- G6: flush view counters collected in Redis ---------- */
-- Adds the deltas to Story.ViewCount, Chapter.ViewCount and StoryViewDaily in one transaction.
-- Ids that no longer exist are ignored.
CREATE OR ALTER PROCEDURE dbo.sp_FlushViews
    @Deltas dbo.ViewDeltaTable READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE s
        SET ViewCount = s.ViewCount + d.Total
        FROM dbo.Story s
        JOIN (SELECT TargetId, SUM(CAST(Delta AS BIGINT)) AS Total
              FROM @Deltas WHERE TargetType = 'S' GROUP BY TargetId) d ON d.TargetId = s.StoryId;

        UPDATE c
        SET ViewCount = c.ViewCount + d.Total
        FROM dbo.Chapter c
        JOIN (SELECT TargetId, SUM(CAST(Delta AS BIGINT)) AS Total
              FROM @Deltas WHERE TargetType = 'C' GROUP BY TargetId) d ON d.TargetId = c.ChapterId;

        MERGE dbo.StoryViewDaily WITH (HOLDLOCK) AS t
        USING (SELECT s.StoryId, d.ViewDate, SUM(d.Delta) AS Delta
               FROM @Deltas d
               JOIN dbo.Story s ON s.StoryId = d.TargetId
               WHERE d.TargetType = 'S'
               GROUP BY s.StoryId, d.ViewDate) AS src
           ON t.StoryId = src.StoryId AND t.ViewDate = src.ViewDate
        WHEN MATCHED THEN
            UPDATE SET Views = t.Views + src.Delta
        WHEN NOT MATCHED THEN
            INSERT (StoryId, ViewDate, Views) VALUES (src.StoryId, src.ViewDate, src.Delta);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
