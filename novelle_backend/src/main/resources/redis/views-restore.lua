-- Puts drained counters back after sp_FlushViews failed, so the next run flushes them.
-- KEYS[1] {prefix}dirty
-- ARGV[1] key prefix, then pairs ARGV[2k] member S|C:{id}:{date}, ARGV[2k+1] delta
-- Returns the number of counters restored.
local restored = 0
for i = 2, #ARGV - 1, 2 do
    local m = ARGV[i]
    local t, id, day = string.match(m, '^([SC]):(%d+):(%d+)$')
    if t then
        local kind = (t == 'S') and 'story:' or 'chapter:'
        redis.call('INCRBY', ARGV[1] .. kind .. id .. ':' .. day, ARGV[i + 1])
        redis.call('SADD', KEYS[1], m)
        restored = restored + 1
    end
end
return restored
