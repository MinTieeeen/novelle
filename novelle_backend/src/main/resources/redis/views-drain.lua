-- Takes up to ARGV[1] counters out of Redis for the flush job, atomically (SPOP + GETDEL in one script):
-- a view arriving afterwards creates a new counter and re-adds its member, so nothing is counted twice and
-- several app instances never flush the same counter.
-- KEYS[1] {prefix}dirty
-- ARGV[1] batch size, ARGV[2] key prefix
-- Returns a flat array {member, value, member, value, ...}. A member that does not match S|C:{id}:{date}
-- is returned with value '0' so the caller can log it; a member whose counter is gone is skipped.
-- The counter name is rebuilt here the same way as ViewKeys.counterOf (single-node Redis only).
local members = redis.call('SPOP', KEYS[1], tonumber(ARGV[1]))
local out = {}
for _, m in ipairs(members) do
    local t, id, day = string.match(m, '^([SC]):(%d+):(%d+)$')
    if t then
        local kind = (t == 'S') and 'story:' or 'chapter:'
        local v = redis.call('GETDEL', ARGV[2] .. kind .. id .. ':' .. day)
        if v then
            out[#out + 1] = m
            out[#out + 1] = v
        end
    else
        out[#out + 1] = m
        out[#out + 1] = '0'
    end
end
return out
