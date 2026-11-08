/*
 * T3 "atomic_increment": INSERT the rating, then update the story with one relative UPDATE
 * (RatingSum + @Score, RatingCount + 1) in the same transaction. No re-read of the ratings: the sessions
 * queue on the X lock of the story row (always taken in the same order) instead of deadlocking.
 * Params: @UserId, @StoryId, @Score.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @UserId INT = ?, @StoryId INT = ?, @Score TINYINT = ?;
DECLARE @t0 DATETIME2(7) = SYSDATETIME(), @ErrorNumber INT;
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO lab.transaction__RatingPlain (UserId, StoryId, Score) VALUES (@UserId, @StoryId, @Score);
    UPDATE lab.transaction__Story
    SET RatingSum   = RatingSum + @Score,
        RatingCount = RatingCount + 1,
        RatingAvg   = CAST((RatingSum + @Score) * 1.0 / (RatingCount + 1) AS DECIMAL(3,2))
    WHERE StoryId = @StoryId;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    SET @ErrorNumber = ERROR_NUMBER();
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
END CATCH;
SELECT @ErrorNumber AS ErrorNumber, DATEDIFF_BIG(MICROSECOND, @t0, SYSDATETIME()) / 1000.0 AS ServerMs;
