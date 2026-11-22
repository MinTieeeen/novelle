-- I5 full-text: one prefix term over (Title, Description), as StorySearchMapper.xml does per term.
-- The parameter is the search condition, e.g. '"kiếm*"' (double quotes make it a prefix term).
SELECT s.StoryId, s.Title
FROM {table} s
JOIN CONTAINSTABLE({table}, (Title, Description), ?) ft ON ft.[KEY] = s.StoryId
