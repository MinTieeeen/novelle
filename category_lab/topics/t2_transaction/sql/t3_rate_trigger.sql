/*
 * T3 "trigger_recompute": what the web does today. One INSERT; trg_Rating runs inside the same (autocommit)
 * transaction, reads every rating of the story and updates the story row. Under concurrency two sessions
 * can wait for each other (one holds the story row, the other an uncommitted rating the first must read):
 * deadlock 1205, caught here and retried by the lab.
 * Params: @UserId, @StoryId, @Score.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @UserId INT = ?, @StoryId INT = ?, @Score TINYINT = ?;
DECLARE @t0 DATETIME2(7) = SYSDATETIME(), @ErrorNumber INT;
BEGIN TRY
    INSERT INTO lab.transaction__Rating (UserId, StoryId, Score) VALUES (@UserId, @StoryId, @Score);
END TRY
BEGIN CATCH
    SET @ErrorNumber = ERROR_NUMBER();
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
END CATCH;
SELECT @ErrorNumber AS ErrorNumber, DATEDIFF_BIG(MICROSECOND, @t0, SYSDATETIME()) / 1000.0 AS ServerMs;
