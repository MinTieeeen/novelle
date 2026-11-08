-- A new PENDING author request (F7) for the experiment; returns its RequestId.
SET NOCOUNT ON;
DECLARE @UserId INT = ?, @PenName NVARCHAR(100) = ?;
DECLARE @RequestId INT = (SELECT COALESCE(MAX(RequestId), 0) + 1 FROM lab.transaction__AuthorRequest);
INSERT INTO lab.transaction__AuthorRequest (RequestId, UserId, ProposedPenName, Status)
VALUES (@RequestId, @UserId, @PenName, 'PENDING');
SELECT @RequestId AS RequestId;
