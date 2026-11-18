-- I7: one view added to a story (what sp_FlushViews does in bulk). Only IX_ViewCount has ViewCount.
UPDATE {table}
SET ViewCount = ViewCount + 1
WHERE StoryId = ?
