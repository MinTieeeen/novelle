-- I1 (F3): the stories of one author (the author page). {table} = the copy of the variant.
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, RatingAvg
FROM {table} {hint}
WHERE AuthorId = ?
