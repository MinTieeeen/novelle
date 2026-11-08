-- Derived columns of the story against what its ratings say. Param: @StoryId (x3).
SELECT s.RatingAvg, s.RatingCount,
       (SELECT COUNT(*) FROM lab.transaction__Rating WHERE StoryId = ?)
     + (SELECT COUNT(*) FROM lab.transaction__RatingPlain WHERE StoryId = ?) AS RatingRows,
       (SELECT CAST(AVG(CAST(Score AS DECIMAL(5,2))) AS DECIMAL(3,2)) FROM (
            SELECT Score FROM lab.transaction__Rating WHERE StoryId = s.StoryId
            UNION ALL SELECT Score FROM lab.transaction__RatingPlain WHERE StoryId = s.StoryId) x) AS RecomputedAvg
FROM lab.transaction__Story s
WHERE s.StoryId = ?;
