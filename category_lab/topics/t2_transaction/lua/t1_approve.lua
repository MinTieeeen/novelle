-- T1 "atomic": approve an author request in one script. Redis runs a script to the end before any other
-- command, so check-then-write cannot interleave with another admin.
-- KEYS[1] req:<id> (Hash)   KEYS[2] user:<id> (Hash)   KEYS[3] author:<userId> (Hash)   KEYS[4] pennames (Set)
-- ARGV[1] adminId   ARGV[2] requestId
local status = redis.call('HGET', KEYS[1], 'Status')
if not status then return {0, 'NOT_FOUND'} end
if status ~= 'PENDING' then return {0, 'ALREADY_PROCESSED'} end
if redis.call('HGET', KEYS[2], 'Role') ~= 'READER' then return {0, 'NOT_READER'} end
local pen = redis.call('HGET', KEYS[1], 'ProposedPenName')
if redis.call('SISMEMBER', KEYS[4], pen) == 1 then return {0, 'PEN_NAME_TAKEN'} end
redis.call('HSET', KEYS[1], 'Status', 'APPROVED', 'ReviewedBy', ARGV[1])
redis.call('HSET', KEYS[2], 'Role', 'AUTHOR')
redis.call('HSET', KEYS[3], 'PenName', pen, 'ApprovedRequestId', ARGV[2])
redis.call('SADD', KEYS[4], pen)
return {1, 'APPROVED'}
