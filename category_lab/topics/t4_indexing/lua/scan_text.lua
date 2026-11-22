-- scan_text.lua (I5): search without an index. SCAN every key, keep the story Hashes whose Title or
-- Description contains the term (string.find, plain substring). string.lower works on bytes, so only ASCII
-- letters are lower-cased: "Kiếm" matches "kiếm", "KIẾM" does not, and "kiem" never matches "kiếm".
--
-- ARGV[1] MATCH pattern of the story keys   ARGV[2] term (lower case)
-- Returns { keys in the database (DBSIZE), { StoryId, ... } }.
local pattern, term = ARGV[1], string.lower(ARGV[2])
local keyspace = redis.call('DBSIZE')
local cursor, ids = '0', {}
repeat
  local page = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
  cursor = page[1]
  for _, key in ipairs(page[2]) do
    local v = redis.call('HMGET', key, 'StoryId', 'Title', 'Description')
    local text = string.lower((v[2] or '') .. ' ' .. (v[3] or ''))
    if string.find(text, term, 1, true) then ids[#ids + 1] = v[1] end
  end
until cursor == '0'
return { keyspace, ids }
