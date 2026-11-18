-- zset_intersect.lua (I2): two single-column indexes combined by the application.
-- Range on the Sorted set by_rating (RatingAvg >= min), then keep the ids that are also in the Set of the
-- wanted status, then read the fields of each story (like Index Seek + filter + Key Lookup).
--
-- ARGV[1] Sorted set by_rating   ARGV[2] Set status:<CompletionStatus>   ARGV[3] min rating
-- ARGV[4] story key prefix       ARGV[5..] fields to read (the first one must exist: StoryId)
-- Returns { ids visited in the range, { StoryId, ... } }.
local zkey, skey, min, prefix = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local fields = {}
for i = 5, #ARGV do fields[#fields + 1] = ARGV[i] end

local candidates = redis.call('ZRANGE', zkey, min, '+inf', 'BYSCORE')
local out = {}
for _, member in ipairs(candidates) do
  if redis.call('SISMEMBER', skey, member) == 1 then
    local id = tostring(tonumber(member))
    redis.call('HMGET', prefix .. id, unpack(fields))
    out[#out + 1] = id
  end
end
return { #candidates, out }
