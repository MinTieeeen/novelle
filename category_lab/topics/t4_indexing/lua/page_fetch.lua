-- page_fetch.lua (I3): one page of a Sorted set in descending score order, then the fields of each story.
--
-- ARGV[1] Sorted set   ARGV[2] mode   ARGV[3], ARGV[4] see below   ARGV[5] page size
-- ARGV[6] story key prefix   ARGV[7..] fields to read
--
-- mode "rank":   ARGV[3] = offset. ZRANGE key offset offset+size-1 REV. A skip list knows the rank of every
--                node, so reaching rank `offset` costs O(log N) whatever the depth.
-- mode "keyset": ARGV[3] = score of the last row of the previous page, ARGV[4] = its member. Reads from that
--                score downwards and skips the rows already shown (same score, member >= the last one;
--                members are zero-padded ids, so string order = StoryId order, as in SQL's tie-breaker).
-- Returns { StoryId, ... } in page order.
local zkey, mode, a, b = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local size, prefix = tonumber(ARGV[5]), ARGV[6]
local fields = {}
for i = 7, #ARGV do fields[#fields + 1] = ARGV[i] end

local members = {}
if mode == 'rank' then
  local offset = tonumber(a)
  members = redis.call('ZRANGE', zkey, offset, offset + size - 1, 'REV')
elseif mode == 'keyset' then
  local last_score, last_member = tonumber(a), b
  -- rows with the same score as the boundary come first; fetch a margin so the skipped ones do not
  -- shorten the page (ties are rare: copies differ by at least 1 ms)
  local batch = redis.call('ZRANGE', zkey, a, '-inf', 'BYSCORE', 'REV', 'LIMIT', 0, size + 50, 'WITHSCORES')
  for i = 1, #batch, 2 do
    local member, score = batch[i], tonumber(batch[i + 1])
    if not (score == last_score and member >= last_member) then
      members[#members + 1] = member
      if #members == size then break end
    end
  end
else
  return redis.error_reply('page_fetch: unknown mode ' .. tostring(mode))
end

local out = {}
for _, member in ipairs(members) do
  local id = tostring(tonumber(member))
  redis.call('HMGET', prefix .. id, unpack(fields))
  out[#out + 1] = id
end
return out
