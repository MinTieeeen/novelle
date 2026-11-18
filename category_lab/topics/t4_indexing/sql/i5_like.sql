-- I5 without a full-text index: substring search on both columns (the parameter is N'%term%').
-- A leading % cannot seek in any index: every row and its Description are read. The comparison follows the
-- column collation (Vietnamese_100_CI_AI: case- and accent-insensitive).
SELECT StoryId, Title
FROM {table}
WHERE Title LIKE ? OR Description LIKE ?
