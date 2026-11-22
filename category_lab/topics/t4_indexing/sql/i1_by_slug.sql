-- I1 (F4): open a story by its slug. {table} = the copy of the variant, {hint} = optional table hint.
-- The parameter is cast to VARCHAR: Slug is VARCHAR(350) and pyodbc sends text as NVARCHAR, which would put
-- a CONVERT_IMPLICIT on the column side and blur the comparison of index variants.
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, RatingAvg
FROM {table} {hint}
WHERE Slug = CAST(? AS VARCHAR(350))
