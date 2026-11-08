-- Redis side: who takes part, read from the web data (dbo is only read). Same choice as authors_pick_users.sql.
SELECT 'ADMIN' AS Kind, UserId, Role FROM (
    SELECT TOP (2) UserId, Role FROM dbo.[User] WHERE Role = 'ADMIN' AND Status = 'ACTIVE' ORDER BY UserId) a
UNION ALL
SELECT 'READER', UserId, Role FROM (
    SELECT TOP (2) u.UserId, u.Role FROM dbo.[User] u
    WHERE u.Role = 'READER' AND u.Status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM dbo.AuthorRequest r WHERE r.UserId = u.UserId AND r.Status = 'PENDING')
    ORDER BY u.UserId DESC) r;
