-- I4: page 1 of the F1 list with the status written as PARAMETERS instead of literals (what an ORM or a
-- generic query builder sends). A cached plan must be right for every value of the parameters, so the
-- optimizer cannot pick an index whose filter (PublishStatus = 'PUBLISHED' AND IsDeleted = 0) might not hold;
-- the plan then reports it under UnmatchedIndexes. OPTION (RECOMPILE) (added by the scenario) compiles for
-- the actual values and can use it again. The parameters are cast to the column types: pyodbc sends text as
-- NVARCHAR, and N'PUBLISHED' compared with a VARCHAR column would not match the index filter even then.
SELECT StoryId, Title, ChapterCount, LastChapterAt
FROM {table}
WHERE PublishStatus = CAST(? AS VARCHAR(10)) AND IsDeleted = CAST(? AS BIT) AND LastChapterAt IS NOT NULL
ORDER BY LastChapterAt DESC, StoryId DESC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY
