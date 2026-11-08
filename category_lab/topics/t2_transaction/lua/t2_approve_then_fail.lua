-- T2 "lua_runtime_error": the three writes in a script, the third fails (KEYS[3] holds a String: WRONGTYPE).
-- A script is atomic (nothing runs in between) but NOT rolled back: the first two writes stay.
-- KEYS[1] req:<id>   KEYS[2] user:<id>   KEYS[3] author:<userId>   ARGV[1] adminId   ARGV[2] penName   ARGV[3] requestId
redis.call('HSET', KEYS[1], 'Status', 'APPROVED', 'ReviewedBy', ARGV[1])
redis.call('HSET', KEYS[2], 'Role', 'AUTHOR')
redis.call('HSET', KEYS[3], 'PenName', ARGV[2], 'ApprovedRequestId', ARGV[3])
return 1
