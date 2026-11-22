-- zset_filter_page.lua (I4): first page of the F1 list from a Sorted set of ALL stories (by_last), checking
-- each story's status on the way, as an unfiltered index + residual predicate would.
-- The listed stories are public (PublishStatus = PUBLISHED, IsDeleted = 0) and have a chapter
-- (LastChapterAt not empty).
--
-- ARGV[1] Sorted set by_last   ARGV[2] page size   ARGV[3] story key prefix   ARGV[4..] fields to read
-- Returns { members looked at, { StoryId, ... } }.
local zkey, size, prefix = ARGV[1], tonumber(ARGV[2]), ARGV[3]
local fields = {}
for i = 4, #ARGV do fields[#fields + 1] = ARGV[i] end

local out, looked, start, chunk = {}, 0, 0, 100
while #out < size do
  local members = redis.call('ZRANGE', zkey, start, start + chunk - 1, 'REV')
  if #members == 0 then break end
  for _, member in ipairs(members) do
    looked = looked + 1
    local id = tostring(tonumber(member))
    local s = redis.call('HMGET', prefix .. id, 'PublishStatus', 'IsDeleted', 'LastChapterAt')
    if s[1] == 'PUBLISHED' and s[2] == '0' and s[3] ~= '' and s[3] ~= false then
      redis.call('HMGET', prefix .. id, unpack(fields))
      out[#out + 1] = id
      if #out == size then break end
    end
  end
  start = start + chunk
end
return { looked, out }
