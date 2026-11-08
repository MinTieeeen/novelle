/*
 * T1 "guarded": dbo.sp_ApproveAuthorRequest (05_procedures.sql) on the sandbox tables, unchanged except:
 *  - @ThinkMs: a pause after the checks, so the second admin is surely waiting while the first holds the locks;
 *  - errors are returned as a row instead of re-thrown, so the lab can count them.
 * UPDLOCK, HOLDLOCK on the request: the second admin waits, then sees Status <> 'PENDING' -> 50001.
 * UPDLOCK, HOLDLOCK on Author.PenName (key-range lock on UQ_Author_PenName): two requests with the same pen
 * name are serialized, the second sees the name taken -> 50003.
 * Params: @RequestId, @AdminId, @ThinkMs.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @RequestId INT = ?, @AdminId INT = ?, @ThinkMs INT = ?;
DECLARE @t0 DATETIME2(7) = SYSDATETIME(), @tLocked DATETIME2(7);
DECLARE @Delay DATETIME = DATEADD(MILLISECOND, @ThinkMs, CAST(0 AS DATETIME));
DECLARE @UserId INT, @PenName NVARCHAR(100), @Status VARCHAR(10);
DECLARE @Outcome VARCHAR(10) = 'APPROVED', @ErrorNumber INT, @ErrorMessage NVARCHAR(400);
BEGIN TRY
    BEGIN TRANSACTION;

    SELECT @UserId = UserId, @PenName = ProposedPenName, @Status = Status
    FROM lab.transaction__AuthorRequest WITH (UPDLOCK, HOLDLOCK)
    WHERE RequestId = @RequestId;
    IF @@ROWCOUNT = 0
        THROW 50004, N'Author request not found.', 1;

    IF NOT EXISTS (SELECT 1 FROM lab.transaction__User WHERE UserId = @AdminId AND Role = 'ADMIN' AND Status = 'ACTIVE')
        THROW 50002, N'Only an active ADMIN can review author requests.', 1;
    IF @Status <> 'PENDING'
        THROW 50001, N'Author request was already processed.', 1;
    IF NOT EXISTS (SELECT 1 FROM lab.transaction__User WITH (UPDLOCK) WHERE UserId = @UserId AND Role = 'READER' AND Status = 'ACTIVE')
        THROW 50002, N'The applicant is not an active READER.', 1;
    IF EXISTS (SELECT 1 FROM lab.transaction__Author WITH (UPDLOCK, HOLDLOCK) WHERE PenName = @PenName)
        THROW 50003, N'Pen name is already in use.', 1;
    SET @tLocked = SYSDATETIME();

    IF @ThinkMs > 0 WAITFOR DELAY @Delay;

    UPDATE lab.transaction__AuthorRequest
    SET Status = 'APPROVED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME()
    WHERE RequestId = @RequestId;
    UPDATE lab.transaction__User SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
    INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId) VALUES (@UserId, @PenName, @RequestId);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    SELECT @Outcome = CASE WHEN ERROR_NUMBER() BETWEEN 50001 AND 50004 THEN 'REJECTED' ELSE 'ERROR' END,
           @ErrorNumber = ERROR_NUMBER(), @ErrorMessage = ERROR_MESSAGE();
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
END CATCH;
SELECT @Outcome AS Outcome, @ErrorNumber AS ErrorNumber, @ErrorMessage AS ErrorMessage,
       DATEDIFF_BIG(MICROSECOND, @t0, COALESCE(@tLocked, SYSDATETIME())) / 1000.0 AS LockWaitMs,
       DATEDIFF_BIG(MICROSECOND, @t0, SYSDATETIME()) / 1000.0 AS ServerMs;
