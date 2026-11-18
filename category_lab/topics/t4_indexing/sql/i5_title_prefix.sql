-- I5: "title starts with" (parameter N'term%'). Without a leading %, an index on Title can seek. It only
-- answers a narrower question (the first word of the title), shown to contrast with a word search.
SELECT StoryId, Title
FROM {table}
WHERE Title LIKE ?
