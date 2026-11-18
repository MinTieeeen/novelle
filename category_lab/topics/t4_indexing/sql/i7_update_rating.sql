-- I7: a new rating changes RatingAvg (what trg_Rating does). RatingAvg is a KEY column of IX_Rating and of the
-- covering IX_Status_Rating_Cover, so each of them must move the row's entry (delete + insert in the B-tree).
-- Repeatable: the value steps by 0.01 and wraps from 5.00 back to 1.00, so every run really changes it.
UPDATE {table}
SET RatingAvg = CASE WHEN RatingAvg >= 4.99 THEN 1.00 ELSE RatingAvg + 0.01 END
WHERE StoryId = ?
