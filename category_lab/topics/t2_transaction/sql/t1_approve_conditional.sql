/*
 * T1 "atomic": check and write in the same statement. The UPDATE only matches while Status = 'PENDING';
 * its X lock makes the second admin wait, and when it gets the row the WHERE no longer matches
 * (0 rows -> 50001). The pen name is claimed by INSERT ... WHERE NOT EXISTS under UPDLOCK, HOLDLOCK.
 * Params: @RequestId, @AdminId, @ThinkMs (pause while holding the X lock on the request).
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @RequestId INT = ?, @AdminId INT = ?, @ThinkMs INT = ?;
DECLARE @t0 DATETIME2(7) = SYSDATETIME(), @tLocked DATETIME2(7);
DECLARE @Delay DATETIME = DATEADD(MILLISECOND, @ThinkMs, CAST(0 AS DATETIME));
DECLARE @UserId INT, @PenName NVARCHAR(100);
DECLARE @Outcome VARCHAR(10) = 'APPROVED', @ErrorNumber INT, @ErrorMessage NVARCHAR(400);
BEGIN TRY
    IF NOT EXISTS (SELECT 1 FROM lab.transaction__User WHERE UserId = @AdminId AND Role = 'ADMIN' AND Status = 'ACTIVE')
        THROW 50002, N'Only an active ADMIN can review author requests.', 1;

    BEGIN TRANSACTION;

    UPDATE lab.transaction__AuthorRequest
    SET Status = 'APPROVED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME(),
        @UserId = UserId, @PenName = ProposedPenName
    WHERE RequestId = @RequestId AND Status = 'PENDING';
    IF @@ROWCOUNT = 0
        THROW 50001, N'Author request was already processed (or does not exist).', 1;
    SET @tLocked = SYSDATETIME();

    IF @ThinkMs > 0 WAITFOR DELAY @Delay;

    UPDATE lab.transaction__User SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME()
    WHERE UserId = @UserId AND Role = 'READER' AND Status = 'ACTIVE';
    IF @@ROWCOUNT = 0
        THROW 50002, N'The applicant is not an active READER.', 1;

    INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId)
    SELECT @UserId, @PenName, @RequestId
    WHERE NOT EXISTS (SELECT 1 FROM lab.transaction__Author WITH (UPDLOCK, HOLDLOCK) WHERE PenName = @PenName);
    IF @@ROWCOUNT = 0
        THROW 50003, N'Pen name is already in use.', 1;

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
