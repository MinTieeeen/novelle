-- T2 step 1/3 of an approval: mark the request APPROVED. Params: @AdminId, @RequestId.
UPDATE lab.transaction__AuthorRequest
SET Status = 'APPROVED', ReviewedBy = ?, ReviewedAt = SYSUTCDATETIME()
WHERE RequestId = ?;
