-- T3 "atomic_increment": one rating per user (HSETNX), then the story's sum, count and average.
-- KEYS[1] story:<id> (Hash RatingSum, RatingCount, RatingAvg)   KEYS[2] ratings:<storyId> (Hash user -> score)
-- ARGV[1] userId   ARGV[2] score
if redis.call('HSETNX', KEYS[2], ARGV[1], ARGV[2]) == 0 then return {0, 'ALREADY_RATED'} end
local sum = redis.call('HINCRBY', KEYS[1], 'RatingSum', ARGV[2])
local count = redis.call('HINCRBY', KEYS[1], 'RatingCount', 1)
local avg = string.format('%.2f', sum / count)
redis.call('HSET', KEYS[1], 'RatingAvg', avg)
return {1, avg}
