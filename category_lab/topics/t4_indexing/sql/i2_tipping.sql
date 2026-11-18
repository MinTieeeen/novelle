-- I2 tipping point: one range condition, the index on RatingAvg does not cover Title / ChapterCount,
-- so every matching row costs a Key Lookup. {hint} = "" (optimizer's choice) or WITH (INDEX(...)).
SELECT StoryId, Title, ChapterCount
FROM {table} {hint}
WHERE RatingAvg >= ?
