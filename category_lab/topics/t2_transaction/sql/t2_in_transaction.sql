/*
 * T2 "in_transaction": the three steps in one transaction with SET XACT_ABORT ON and TRY/CATCH, the pattern
 * every procedure in 05_procedures.sql uses. The INSERT Author fails (2627); XACT_ABORT makes the transaction
 * uncommittable (XACT_STATE() = -1) and the CATCH rolls everything back.
 * The procedures re-THROW in the CATCH; here the error is returned as a row so the lab can show it.
 * Params: @RequestId, @AdminId, @UserId, @PenName.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @RequestId INT = ?, @AdminId INT = ?, @UserId INT = ?, @PenName NVARCHAR(100) = ?;
DECLARE @RoleInside VARCHAR(10), @ErrorNumber INT, @ErrorMessage NVARCHAR(400), @XactState SMALLINT,
        @Outcome VARCHAR(12) = 'COMMITTED';
BEGIN TRY
    BEGIN TRANSACTION;
    UPDATE lab.transaction__AuthorRequest
    SET Status = 'APPROVED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME()
    WHERE RequestId = @RequestId;
    UPDATE lab.transaction__User SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
    SELECT @RoleInside = Role FROM lab.transaction__User WHERE UserId = @UserId;     -- 'AUTHOR', not committed yet
    INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId) VALUES (@UserId, @PenName, @RequestId);
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    SELECT @ErrorNumber = ERROR_NUMBER(), @ErrorMessage = ERROR_MESSAGE(), @XactState = XACT_STATE();
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    SET @Outcome = 'ROLLED_BACK';
END CATCH;
SELECT @Outcome AS Outcome, @RoleInside AS RoleInside, @ErrorNumber AS ErrorNumber, @ErrorMessage AS ErrorMessage,
       @XactState AS XactStateInCatch, @@TRANCOUNT AS OpenTransactions;
