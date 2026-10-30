/*
 * 20_users.sql   [RDS OK]   Seed step 2 of 5.
 *
 * 200 users: 3 ADMIN, 30 AUTHOR, 167 READER (4 of them BANNED), 46 author requests
 * (30 APPROVED matching 30 Author rows, 5 PENDING, 8 REJECTED, 3 CANCELLED).
 *
 * Fixed demo accounts (all share the password given to the runner as $(DEMO_PASSWORD_HASH), a BCrypt hash):
 *   admin, admin02, admin03   ADMIN
 *   author01 .. author30      AUTHOR   (author01 owns the demo stories made in step 30)
 *   reader01                  READER   (has follows, history, ratings, reading lists: step 50)
 *   reader02                  READER   (no request, no activity: to demo the whole request -> approve flow)
 *   reader03 .. reader167     READER
 *
 * Run: sqlcmd ... -f 65001 -v DEMO_PASSWORD_HASH="<bcrypt hash>" -i 20_users.sql
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'seed.Lex') IS NULL
    THROW 50120, N'Run 10_corpus.sql first.', 1;
IF EXISTS (SELECT 1 FROM dbo.[User])
    THROW 50100, N'The database already contains users. Run 99_reset.sql first.', 1;
GO

/* ---------- 1. plan the 200 users ---------- */
DROP TABLE IF EXISTS seed.UserPlan;
CREATE TABLE seed.UserPlan (
    n            INT           NOT NULL PRIMARY KEY,
    Username     VARCHAR(50)   NOT NULL,
    Role         VARCHAR(10)   NOT NULL,
    Status       VARCHAR(10)   NOT NULL,
    DisplayName  NVARCHAR(100) NOT NULL,
    CreatedAt    DATETIME2(3)  NOT NULL,
    LastLoginAt  DATETIME2(3)  NULL,
    BanReason    NVARCHAR(500) NULL,
    BannedAt     DATETIME2(3)  NULL
);
GO

INSERT seed.UserPlan (n, Username, Role, Status, DisplayName, CreatedAt)
SELECT n.n, u.Username, u.Role, u.Status, dn.DisplayName,
       DATEADD(SECOND, -CAST(ROUND(u.AgeDays * 86400, 0) AS INT), p.RefNow)
FROM seed.Nums n
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(n.n, 101) r1
CROSS APPLY seed.fn_Rnd(n.n, 102) r2
CROSS APPLY seed.fn_Rnd(n.n, 103) r3
CROSS APPLY seed.fn_Rnd(n.n, 104) r4
CROSS APPLY (SELECT
        Role     = CASE WHEN n.n <= 3 THEN 'ADMIN' WHEN n.n <= 33 THEN 'AUTHOR' ELSE 'READER' END,
        Username = CASE WHEN n.n = 1 THEN 'admin'
                        WHEN n.n <= 3 THEN CONCAT('admin0', n.n)
                        WHEN n.n <= 33 THEN CONCAT('author', RIGHT(CONCAT('0', n.n - 3), 2))
                        ELSE CONCAT('reader', CASE WHEN n.n - 33 < 100 THEN RIGHT(CONCAT('0', n.n - 33), 2)
                                                   ELSE CAST(n.n - 33 AS VARCHAR(3)) END) END,
        Status   = CASE WHEN n.n > 33 AND (n.n - 33) % 41 = 7 THEN 'BANNED' ELSE 'ACTIVE' END,
        AgeDays  = CASE WHEN n.n <= 3  THEN 700 + r4.r * 30         -- admins: the oldest accounts
                        WHEN n.n <= 33 THEN 200 + r4.r * 530        -- authors: at least 200 days old
                        ELSE 1 + r4.r * 729 END) u
CROSS APPLY seed.fn_Lex('NF', '', r1.r) f
CROSS APPLY seed.fn_Lex('NM', '', r2.r) m
CROSS APPLY seed.fn_Lex('NG', '', r3.r) g
CROSS APPLY (SELECT DisplayName = CASE n.n
                    WHEN 1  THEN N'Quản trị viên'
                    WHEN 2  THEN N'Quản trị viên 2'
                    WHEN 3  THEN N'Quản trị viên 3'
                    WHEN 4  THEN N'Tác giả Demo'
                    WHEN 34 THEN N'Độc giả Demo 1'
                    WHEN 35 THEN N'Độc giả Demo 2'
                    ELSE CONCAT(f.Body, N' ', m.Body, N' ', g.Body) END) dn
WHERE n.n <= 200
ORDER BY n.n;
GO

-- ban details and last login (a banned user last logged in just before the ban)
UPDATE up
SET BannedAt  = CASE WHEN up.Status = 'BANNED'
                     THEN DATEADD(SECOND, CAST((0.5 + 0.5 * r.r) * DATEDIFF(SECOND, up.CreatedAt, p.RefNow) AS INT), up.CreatedAt) END,
    BanReason = CASE WHEN up.Status = 'BANNED' THEN b.Body END
FROM seed.UserPlan up
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(up.n, 105) r
CROSS APPLY seed.fn_Lex('BAN', '', r.r) b;

UPDATE up
SET LastLoginAt = CASE WHEN up.Status = 'BANNED' THEN DATEADD(HOUR, -1, up.BannedAt)
                       WHEN r.r < 0.85 THEN DATEADD(SECOND, CAST(r.r / 0.85 * DATEDIFF(SECOND, up.CreatedAt, p.RefNow) AS INT), up.CreatedAt) END
FROM seed.UserPlan up
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(up.n, 106) r;
GO

/* ---------- 2. insert the users ---------- */
INSERT dbo.[User] (Username, Email, PasswordHash, DisplayName, Role, Status, BanReason, BannedAt, LastLoginAt, CreatedAt, UpdatedAt)
SELECT up.Username, CONCAT(up.Username, '@novelle.test'), '$(DEMO_PASSWORD_HASH)', up.DisplayName,
       up.Role, up.Status, up.BanReason, up.BannedAt, up.LastLoginAt, up.CreatedAt,
       COALESCE(up.LastLoginAt, up.CreatedAt)
FROM seed.UserPlan up
ORDER BY up.n;

UPDATE dbo.[User]
SET BannedBy = (SELECT UserId FROM dbo.[User] WHERE Username = 'admin')
WHERE Status = 'BANNED';

DROP TABLE IF EXISTS seed.UserMap;
SELECT up.n, u.UserId, up.Role, up.Status, up.CreatedAt
INTO seed.UserMap
FROM seed.UserPlan up
JOIN dbo.[User] u ON u.Username = up.Username;
ALTER TABLE seed.UserMap ADD CONSTRAINT PK_seed_UserMap PRIMARY KEY (n);
GO

/* ---------- 3. author requests: 30 APPROVED (one per author) + 5 PENDING + 8 REJECTED + 3 CANCELLED ---------- */
DROP TABLE IF EXISTS seed.ReqPlan;
CREATE TABLE seed.ReqPlan (
    ReqIdx      INT           NOT NULL PRIMARY KEY,
    UserN       INT           NOT NULL,
    Status      VARCHAR(10)   NOT NULL,
    PenName     NVARCHAR(100) NOT NULL,
    Intro       NVARCHAR(2000) NULL,
    CreatedAt   DATETIME2(3)  NULL,
    ReviewerN   INT           NULL,
    ReviewedAt  DATETIME2(3)  NULL,
    ReviewNote  NVARCHAR(500) NULL
);
GO

;WITH elig AS (          -- active readers other than the two demo readers, in a fixed random order
    SELECT m.n, rk = ROW_NUMBER() OVER (ORDER BY r.r)
    FROM seed.UserMap m
    CROSS APPLY seed.fn_Rnd(m.n, 201) r
    WHERE m.Role = 'READER' AND m.Status = 'ACTIVE' AND m.n NOT IN (34, 35)
),
pairs AS (               -- 225 distinct pen-name pairs in a fixed random order
    SELECT p = n.n, rk = ROW_NUMBER() OVER (ORDER BY r.r)
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 202) r
    WHERE n.n <= 225
),
rp AS (
    SELECT ReqIdx = k.n, UserN = k.n + 3, Status = CAST('APPROVED' AS VARCHAR(10))
    FROM seed.Nums k WHERE k.n <= 30
    UNION ALL
    SELECT 30 + e.rk, e.n,
           CASE WHEN e.rk <= 5 THEN 'PENDING' WHEN e.rk <= 13 THEN 'REJECTED' ELSE 'CANCELLED' END
    FROM elig e WHERE e.rk <= 16
)
INSERT seed.ReqPlan (ReqIdx, UserN, Status, PenName)
SELECT rp.ReqIdx, rp.UserN, rp.Status, CONCAT(pa.Body, N' ', pb.Body)
FROM rp
JOIN pairs pr ON pr.rk = rp.ReqIdx
JOIN seed.Lex pa ON pa.Kind = 'PA' AND pa.Slug = '' AND pa.Idx = ((pr.p - 1) % 15) + 1
JOIN seed.Lex pb ON pb.Kind = 'PB' AND pb.Slug = '' AND pb.Idx = ((pr.p - 1) / 15) + 1;
GO

-- request created between 10% and 50% of the way from the user's sign-up to now
UPDATE rp
SET Intro     = i.Body,
    CreatedAt = DATEADD(SECOND, CAST((0.1 + 0.4 * r1.r) * DATEDIFF(SECOND, m.CreatedAt, p.RefNow) AS INT), m.CreatedAt)
FROM seed.ReqPlan rp
JOIN seed.UserMap m ON m.n = rp.UserN
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 203) r1
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 204) r2
CROSS APPLY seed.fn_Lex('INT', '', r2.r) i;

-- decision made 20%..80% of the way from the request to now (APPROVED and REJECTED only)
UPDATE rp
SET ReviewerN  = CASE WHEN rp.Status IN ('APPROVED', 'REJECTED') THEN 1 + CAST(FLOOR(r1.r * 3) AS INT) END,
    ReviewedAt = CASE WHEN rp.Status IN ('APPROVED', 'REJECTED')
                      THEN DATEADD(SECOND, CAST((0.2 + 0.6 * r2.r) * DATEDIFF(SECOND, rp.CreatedAt, p.RefNow) AS INT), rp.CreatedAt) END,
    ReviewNote = CASE WHEN rp.Status = 'REJECTED' THEN rej.Body END
FROM seed.ReqPlan rp
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 205) r1
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 206) r2
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 207) r3
CROSS APPLY seed.fn_Lex('REJ', '', r3.r) rej;
GO

INSERT dbo.AuthorRequest (UserId, ProposedPenName, Introduction, Status, ReviewedBy, ReviewedAt, ReviewNote, CreatedAt)
SELECT m.UserId, rp.PenName, rp.Intro, rp.Status, mr.UserId, rp.ReviewedAt, rp.ReviewNote, rp.CreatedAt
FROM seed.ReqPlan rp
JOIN seed.UserMap m ON m.n = rp.UserN
LEFT JOIN seed.UserMap mr ON mr.n = rp.ReviewerN
ORDER BY rp.ReqIdx;
GO

/* ---------- 4. author profiles for the 30 approved requests ---------- */
INSERT dbo.Author (UserId, PenName, Bio, IsVerified, ApprovedRequestId, CreatedAt)
SELECT ar.UserId, ar.ProposedPenName,
       CASE WHEN r.r < 0.6 THEN bio.Body END,
       CASE WHEN rp.ReqIdx % 10 = 0 THEN 1 ELSE 0 END,
       ar.RequestId, ar.ReviewedAt
FROM dbo.AuthorRequest ar
JOIN seed.ReqPlan rp ON rp.PenName = ar.ProposedPenName
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 208) r
CROSS APPLY seed.fn_Rnd(rp.ReqIdx, 209) r2
CROSS APPLY seed.fn_Lex('BIO', '', r2.r) bio
WHERE ar.Status = 'APPROVED'
ORDER BY rp.ReqIdx;

DROP TABLE IF EXISTS seed.AuthorMap;
SELECT m.n - 3 AS k, m.UserId
INTO seed.AuthorMap
FROM seed.UserMap m
WHERE m.Role = 'AUTHOR';
ALTER TABLE seed.AuthorMap ALTER COLUMN k INT NOT NULL;
ALTER TABLE seed.AuthorMap ADD CONSTRAINT PK_seed_AuthorMap PRIMARY KEY (k);
GO

/* ---------- checks ---------- */
IF (SELECT COUNT(*) FROM dbo.[User]) <> 200
   OR (SELECT COUNT(*) FROM dbo.[User] WHERE Role = 'ADMIN') <> 3
   OR (SELECT COUNT(*) FROM dbo.[User] WHERE Role = 'AUTHOR') <> 30
   OR (SELECT COUNT(*) FROM dbo.[User] WHERE Status = 'BANNED') <> 4
   OR (SELECT COUNT(*) FROM dbo.AuthorRequest) <> 46
   OR (SELECT COUNT(*) FROM dbo.Author) <> 30
    THROW 50121, N'20_users: unexpected row counts.', 1;
GO

SELECT Role, Status, COUNT(*) AS Users FROM dbo.[User] GROUP BY Role, Status ORDER BY Role, Status;
SELECT Status, COUNT(*) AS Requests FROM dbo.AuthorRequest GROUP BY Status ORDER BY Status;
SELECT COUNT(*) AS Authors, SUM(CAST(IsVerified AS INT)) AS Verified FROM dbo.Author;
SELECT Username, Role, Status, DisplayName FROM dbo.[User] WHERE Username IN ('admin', 'author01', 'reader01', 'reader02') ORDER BY Username;
GO
