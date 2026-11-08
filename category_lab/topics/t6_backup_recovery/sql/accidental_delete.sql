-- Named statements of the accidental_delete scenario; {table} is the temporal copy of dbo.Chapter.

-- name: target_story
SELECT TOP (1) StoryId FROM {table} GROUP BY StoryId ORDER BY COUNT(*) DESC, StoryId;

-- name: now_utc
SELECT CONVERT(varchar(27), SYSUTCDATETIME(), 126);

-- name: fingerprint
-- Row count and a checksum over every column of one story's chapters, to prove the restore is exact.
SELECT COUNT(*) AS chapters,
       CHECKSUM_AGG(CHECKSUM(ChapterId, ChapterNo, Title, WordCount, HASHBYTES('SHA2_256', Content))) AS checksum
FROM {table} WHERE StoryId = ?;

-- name: accident
DELETE FROM {table} WHERE StoryId = ?;

-- name: restore
-- Read the rows as they were at ? (UTC) from current + history, and put back the ones that are missing.
DECLARE @as_of datetime2(7) = CONVERT(datetime2(7), ?, 126);
INSERT INTO {table} (ChapterId, StoryId, ChapterNo, Title, Content, WordCount)
SELECT ChapterId, StoryId, ChapterNo, Title, Content, WordCount
FROM {table} FOR SYSTEM_TIME AS OF @as_of
WHERE StoryId = ?;

-- name: delete_and_restore
-- Repeatable form used for timing: delete the story's chapters, then restore them AS OF the given time.
DECLARE @as_of datetime2(7) = CONVERT(datetime2(7), ?, 126);
DELETE FROM {table} WHERE StoryId = ?;
INSERT INTO {table} (ChapterId, StoryId, ChapterNo, Title, Content, WordCount)
SELECT ChapterId, StoryId, ChapterNo, Title, Content, WordCount
FROM {table} FOR SYSTEM_TIME AS OF @as_of
WHERE StoryId = ?;

-- name: history_rows
SELECT COUNT(*) FROM {history};
