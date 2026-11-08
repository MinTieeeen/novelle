-- Two active ADMINs (the reviewers) and two active READERs without a PENDING request (the applicants).
SELECT 'ADMIN' AS Kind, UserId FROM (
    SELECT TOP (2) UserId FROM lab.transaction__User
    WHERE Role = 'ADMIN' AND Status = 'ACTIVE' ORDER BY UserId) a
UNION ALL
SELECT 'READER', UserId FROM (
    SELECT TOP (2) u.UserId FROM lab.transaction__User u
    WHERE u.Role = 'READER' AND u.Status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM lab.transaction__AuthorRequest r WHERE r.UserId = u.UserId AND r.Status = 'PENDING')
    ORDER BY u.UserId DESC) r;
