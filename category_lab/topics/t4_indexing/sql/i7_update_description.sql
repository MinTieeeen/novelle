-- I7: the author edits the description. No nonclustered index holds Description, so only the clustered index
-- (the row itself) changes, whatever the number of indexes. Repeatable: the first character alternates between
-- '#' and '@' (same length, so a 4000-character description never overflows).
UPDATE {table}
SET Description = STUFF(Description, 1, 1, CASE WHEN LEFT(Description, 1) = N'#' THEN N'@' ELSE N'#' END)
WHERE StoryId = ?
