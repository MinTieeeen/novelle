-- Empty ratings and one story copied from the web data (title only). Param: @StoryId.
DELETE FROM lab.transaction__Rating;
DELETE FROM lab.transaction__RatingPlain;
DELETE FROM lab.transaction__Story;
INSERT INTO lab.transaction__Story (StoryId, Title)
SELECT StoryId, Title FROM dbo.Story WHERE StoryId = ?;
