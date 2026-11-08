-- T2 step 3/3: the Author profile. Fails with 2627 when the pen name is taken (UQ_Author_PenName).
-- Params: @UserId, @PenName, @RequestId.
INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId) VALUES (?, ?, ?);
