-- Counts one view (docs/module-reading.md section 5.2), atomically:
-- the "already counted" marker and the counters can never get out of step.
-- KEYS[1] {prefix}seen:{chapterId}:{viewer}
-- KEYS[2] {prefix}story:{storyId}:{yyyyMMdd}
-- KEYS[3] {prefix}chapter:{chapterId}:{yyyyMMdd}
-- KEYS[4] {prefix}dirty
-- ARGV[1] seen TTL in seconds, ARGV[2] story member S:{id}:{date}, ARGV[3] chapter member C:{id}:{date}
-- Returns 1 when the view was counted, 0 when the viewer was already counted inside the window.
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
    redis.call('INCR', KEYS[2])
    redis.call('INCR', KEYS[3])
    redis.call('SADD', KEYS[4], ARGV[2], ARGV[3])
    return 1
end
return 0
