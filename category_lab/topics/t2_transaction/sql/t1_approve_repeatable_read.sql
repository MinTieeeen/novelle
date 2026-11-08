/*
 * T1 "repeatable_read": the read_then_write approval under REPEATABLE READ instead of lock hints.
 * Both admins keep their S lock on the request row until the end of the transaction; after the pause both
 * try to UPDATE it (S -> X) and each waits for the other: a deadlock. SQL Server kills one (error 1205,
 * caught here and returned); the lab retries it, and the retry sees Status = 'APPROVED' -> 50001.
 * Params: @RequestId, @AdminId, @ThinkMs.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
DECLARE @RequestId INT = ?, @AdminId INT = ?, @ThinkMs INT = ?;
DECLARE @t0 DATETIME2(7) = SYSDATETIME();
DECLARE @Delay DATETIME = DATEADD(MILLISECOND, @ThinkMs, CAST(0 AS DATETIME));
DECLARE @UserId INT, @PenName NVARCHAR(100), @Status VARCHAR(10);
DECLARE @Outcome VARCHAR(10) = 'APPROVED', @ErrorNumber INT, @ErrorMessage NVARCHAR(400);
BEGIN TRY
    BEGIN TRANSACTION;

    SELECT @UserId = UserId, @PenName = ProposedPenName, @Status = Status
    FROM lab.transaction__AuthorRequest
    WHERE RequestId = @RequestId;
    IF @@ROWCOUNT = 0
        THROW 50004, N'Author request not found.', 1;
    IF @Status <> 'PENDING'
        THROW 50001, N'Author request was already processed.', 1;
    IF EXISTS (SELECT 1 FROM lab.transaction__Author WHERE PenName = @PenName)
        THROW 50003, N'Pen name is already in use.', 1;

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
       CAST(NULL AS FLOAT) AS LockWaitMs,
       DATEDIFF_BIG(MICROSECOND, @t0, SYSDATETIME()) / 1000.0 AS ServerMs;
