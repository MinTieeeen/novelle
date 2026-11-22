-- Releases a lock only when it is still held by the caller (compare-and-delete).
-- A plain DEL could remove a lock that expired and was taken by someone else in the meantime.
-- KEYS[1] = lock key, ARGV[1] = token returned when the lock was taken.
-- Returns 1 when the lock was released, 0 when it was gone or held by another owner.
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
