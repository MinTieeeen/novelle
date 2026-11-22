-- fetch_members.lua: the second step of every "manual index" lookup. Given the ids found in a Set / Sorted
-- set, read the wanted fields of each story Hash (like a Key Lookup in SQL Server).
--
-- ARGV[1]  story key prefix, e.g. lab:indexing:s10000:story:
-- ARGV[2]  number of fields F (at least 1)
-- ARGV[3 .. 2+F]  field names; the first must exist in every Hash (StoryId): it tells whether the Hash exists
-- ARGV[3+F ..]    ids (zero-padded members are accepted: tonumber removes the padding)
--
-- Returns { StoryId, ... } of the Hashes that exist, in the given order.
local prefix, nfields = ARGV[1], tonumber(ARGV[2])
local fields = {}
for i = 1, nfields do fields[i] = ARGV[2 + i] end

local out = {}
for i = 3 + nfields, #ARGV do
  local id = tostring(tonumber(ARGV[i]))
  local values = redis.call('HMGET', prefix .. id, unpack(fields))
  if values[1] ~= false then out[#out + 1] = id end
end
return out
