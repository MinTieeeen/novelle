-- zrange_fetch.lua (I2): a score range on ONE Sorted set, then read the fields of each story.
-- Used for by_rating:<status> (the key name holds the equality column, the score the range column: the
-- Redis shape of a composite index) and for the tipping-point sweep on by_rating.
--
-- ARGV[1] Sorted set   ARGV[2] min score   ARGV[3] max score   ARGV[4] story key prefix
-- ARGV[5..] fields to read
-- Returns { StoryId, ... }.
local zkey, min, max, prefix = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local fields = {}
for i = 5, #ARGV do fields[#fields + 1] = ARGV[i] end

local out = {}
for _, member in ipairs(redis.call('ZRANGE', zkey, min, max, 'BYSCORE')) do
  local id = tostring(tonumber(member))
  redis.call('HMGET', prefix .. id, unpack(fields))
  out[#out + 1] = id
end
return out
