-- scan_filter.lua: the "no index" way in Redis. Walks the WHOLE keyspace with SCAN, keeps the story Hashes
-- whose fields satisfy every condition, and returns them.
--
-- ARGV[1]  MATCH pattern of the story keys, e.g. lab:indexing:s10000:story:*
-- ARGV[2]  "ids" (return the matching StoryIds) or "count" (return only the number of matches)
-- ARGV[3..] conditions, three values each: field, op, value
--          op: eq        field == value (string comparison)
--              ge        tonumber(field) >= tonumber(value)
--              contains  value occurs in field, case-insensitive for ASCII only (string.lower works on
--                        bytes: Vietnamese capitals and tone marks are NOT folded; that is part of I5)
--
-- Returns { keys in the database (DBSIZE), matches, { StoryId, ... } }.
-- SCAN visits every key of the database, not only those of the pattern (MATCH filters after visiting):
-- the cost depends on the whole keyspace, hence DBSIZE in the reply.
local pattern, mode = ARGV[1], ARGV[2]
local conds = {}
for i = 3, #ARGV, 3 do
  conds[#conds + 1] = { ARGV[i], ARGV[i + 1], ARGV[i + 2] }
end

local cursor, matches, ids = '0', 0, {}
local keyspace = redis.call('DBSIZE')
repeat
  local page = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
  cursor = page[1]
  for _, key in ipairs(page[2]) do
    local ok = true
    for _, c in ipairs(conds) do
      local v = redis.call('HGET', key, c[1])
      if c[2] == 'eq' then
        ok = (v == c[3])
      elseif c[2] == 'ge' then
        ok = (v ~= false and v ~= '' and tonumber(v) >= tonumber(c[3]))
      elseif c[2] == 'contains' then
        ok = (v ~= false and string.find(string.lower(v), string.lower(c[3]), 1, true) ~= nil)
      else
        return redis.error_reply('scan_filter: unknown op ' .. tostring(c[2]))
      end
      if not ok then break end
    end
    if ok then
      matches = matches + 1
      if mode == 'ids' then ids[#ids + 1] = redis.call('HGET', key, 'StoryId') end
    end
  end
until cursor == '0'

return { keyspace, matches, ids }
