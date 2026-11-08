/*
 * T2 "commit_after_error": BEGIN TRANSACTION alone is not enough. With XACT_ABORT OFF (the session default)
 * a constraint error such as 2627 ends only the failing statement; the transaction stays committable
 * (XACT_STATE() = 1). Code that catches the error and still runs COMMIT keeps steps 1 and 2.
 * Params: @RequestId, @AdminId, @UserId, @PenName.
 */
SET NOCOUNT ON;
SET XACT_ABORT OFF;
DECLARE @RequestId INT = ?, @AdminId INT = ?, @UserId INT = ?, @PenName NVARCHAR(100) = ?;
DECLARE @RoleInside VARCHAR(10), @ErrorNumber INT, @ErrorMessage NVARCHAR(400), @XactState SMALLINT;
BEGIN TRANSACTION;
UPDATE lab.transaction__AuthorRequest
SET Status = 'APPROVED', ReviewedBy = @AdminId, ReviewedAt = SYSUTCDATETIME()
WHERE RequestId = @RequestId;
UPDATE lab.transaction__User SET Role = 'AUTHOR', UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
SELECT @RoleInside = Role FROM lab.transaction__User WHERE UserId = @UserId;
BEGIN TRY
    INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId) VALUES (@UserId, @PenName, @RequestId);
END TRY
BEGIN CATCH
    SELECT @ErrorNumber = ERROR_NUMBER(), @ErrorMessage = ERROR_MESSAGE(), @XactState = XACT_STATE();
END CATCH;
COMMIT TRANSACTION;                               -- the bug: commits whatever is left
SELECT 'COMMITTED' AS Outcome, @RoleInside AS RoleInside, @ErrorNumber AS ErrorNumber, @ErrorMessage AS ErrorMessage,
       @XactState AS XactStateInCatch, @@TRANCOUNT AS OpenTransactions;
