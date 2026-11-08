/*
 * T1 "read_then_write": the same approval WITHOUT lock hints (plain READ COMMITTED). The shared locks of the
 * SELECTs are released as soon as each row is read, so both admins read Status = 'PENDING' during the pause
 * (@ThinkMs) and both go on to write. Whatever stops the second one is a constraint, not the logic:
 * PK_Author (same request) or UQ_Author_PenName (same pen name) -> 2627.
 * Params: @RequestId, @AdminId, @ThinkMs.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
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
    IF NOT EXISTS (SELECT 1 FROM lab.transaction__User WHERE UserId = @UserId AND Role = 'READER' AND Status = 'ACTIVE')
        THROW 50002, N'The applicant is not an active READER.', 1;
    IF EXISTS (SELECT 1 FROM lab.transaction__Author WHERE PenName = @PenName)
        THROW 50003, N'Pen name is already in use.', 1;

    IF @ThinkMs > 0 WAITFOR DELAY @Delay;          -- the other admin checks the same rows meanwhile

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
