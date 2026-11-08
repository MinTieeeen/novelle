-- T2 "lua_check_first": the Redis way to get "all or nothing": check everything that could fail BEFORE the
-- first write, and return an error without writing anything.
-- KEYS / ARGV as in t2_approve_then_fail.lua.
local t = redis.call('TYPE', KEYS[3])['ok']
if t ~= 'none' and t ~= 'hash' then
    return redis.error_reply('AUTHOR_KEY_WRONGTYPE ' .. KEYS[3] .. ' is a ' .. t)
end
if redis.call('HGET', KEYS[1], 'Status') ~= 'PENDING' then return redis.error_reply('ALREADY_PROCESSED') end
redis.call('HSET', KEYS[1], 'Status', 'APPROVED', 'ReviewedBy', ARGV[1])
redis.call('HSET', KEYS[2], 'Role', 'AUTHOR')
redis.call('HSET', KEYS[3], 'PenName', ARGV[2], 'ApprovedRequestId', ARGV[3])
return 1
