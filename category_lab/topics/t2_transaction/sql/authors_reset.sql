-- Fresh copy of the web data before each variant (reads dbo, writes only the sandbox).
DELETE FROM lab.transaction__Author;
DELETE FROM lab.transaction__AuthorRequest;
DELETE FROM lab.transaction__User;
INSERT INTO lab.transaction__User (UserId, Username, Role, Status, UpdatedAt)
SELECT UserId, Username, Role, Status, UpdatedAt FROM dbo.[User];
INSERT INTO lab.transaction__AuthorRequest (RequestId, UserId, ProposedPenName, Status, ReviewedBy, ReviewedAt)
SELECT RequestId, UserId, ProposedPenName, Status, ReviewedBy, ReviewedAt FROM dbo.AuthorRequest;
INSERT INTO lab.transaction__Author (UserId, PenName, ApprovedRequestId, CreatedAt)
SELECT UserId, PenName, ApprovedRequestId, CreatedAt FROM dbo.Author;
