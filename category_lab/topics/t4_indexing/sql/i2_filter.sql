-- I2 (F2 catalog filter): completion status + minimum rating, as StorySearchMapper.xml builds it.
SELECT StoryId, Title, RatingAvg, ChapterCount
FROM {table} {hint}
WHERE CompletionStatus = ? AND RatingAvg >= ?
