-- Named statements of the atomic_rollback scenario; {table} is a sandbox copy of dbo.Story.

-- name: snapshot
SELECT StoryId, ViewCount, RatingAvg FROM {table} ORDER BY StoryId;

-- name: add_views
UPDATE {table} SET ViewCount = ViewCount + 100 WHERE StoryId = ?;

-- name: divide_by_zero
UPDATE {table} SET RatingAvg = RatingAvg / 0 WHERE StoryId = ?;

-- name: compile_error
-- The second UPDATE names a column that does not exist: the whole batch fails to compile, nothing runs.
BEGIN TRANSACTION;
UPDATE {table} SET ViewCount = ViewCount + 100 WHERE StoryId = ?;
UPDATE {table} SET NoSuchColumn = 1 WHERE StoryId = ?;
COMMIT TRANSACTION;
