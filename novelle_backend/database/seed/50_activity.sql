/*
 * 50_activity.sql   [RDS OK]   Seed step 5 of 5 (then 90_finalize.sql).
 *
 * Reader activity, with a Zipf-like popularity (a few "hot" stories get most of the activity; the low
 * StoryIds, including author01's stories 1, 2, 4, 5, are the hottest):
 *   AuthorFollow ~800, Follow ~2,000, Rating ~1,200 (skewed to 4-5 stars, ~40% with a review),
 *   ReadingHistory ~1,500, ReadingList 150 (+ ~1,000 items), StoryViewDaily ~10,000 (last 90 days).
 * Rules respected: ADMINs take no part (RB16); nobody rates his own story (RB4); the last-read chapter
 * belongs to the story (RB5); nobody follows himself.
 * The two triggers trg_Rating, trg_Follow, trg_AuthorFollow keep the counters on Story and Author in sync.
 *
 * reader01 gets fixed demo data (5 followed stories + author01, 8 reading-history rows, 3 ratings, 2 lists).
 * reader02 and the 2 demo accounts' requests are left untouched: reader02 has no activity at all.
 * Run with -f 65001.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'seed.StoryPlan') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Chapter)
    THROW 50120, N'Run 10_corpus.sql ... 40_chapters.sql first.', 1;
IF EXISTS (SELECT 1 FROM dbo.Follow) OR EXISTS (SELECT 1 FROM dbo.Rating)
    THROW 50100, N'The database already contains reader activity. Run 99_reset.sql first.', 1;
GO

/* ---------- pools: who can act, which stories can be acted on ---------- */
DROP TABLE IF EXISTS seed.Pool;
SELECT rk = ROW_NUMBER() OVER (ORDER BY m.n), m.n AS UserN, m.UserId, m.CreatedAt
INTO seed.Pool
FROM seed.UserMap m
WHERE m.Role <> 'ADMIN' AND m.n NOT IN (34, 35);          -- not admins, not reader01/reader02 (demo data is explicit)
ALTER TABLE seed.Pool ALTER COLUMN rk BIGINT NOT NULL;
ALTER TABLE seed.Pool ADD CONSTRAINT PK_seed_Pool PRIMARY KEY (rk);

DROP TABLE IF EXISTS seed.PubStory;
SELECT rk = ROW_NUMBER() OVER (ORDER BY sp.n), sp.n AS StoryN, sp.StoryId, s.AuthorId AS AuthorUserId,
       sp.PublishedAt, sp.ChPublished
INTO seed.PubStory
FROM seed.StoryPlan sp
JOIN dbo.Story s ON s.StoryId = sp.StoryId
WHERE sp.Status = 'PUBLISHED';
ALTER TABLE seed.PubStory ALTER COLUMN rk BIGINT NOT NULL;
ALTER TABLE seed.PubStory ADD CONSTRAINT PK_seed_PubStory PRIMARY KEY (rk);
GO

/* ---------- AuthorFollow: readers follow authors (authors with low k are more popular) ---------- */
DECLARE @P INT = (SELECT COUNT(*) FROM seed.Pool);
;WITH cand AS (
    SELECT n.n,
           uRk = 1 + CAST(FLOOR(@P * r1.r) AS INT),
           aK  = 1 + CAST(FLOOR(30 * POWER(r2.r, 2)) AS INT)
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 501) r1
    CROSS APPLY seed.fn_Rnd(n.n, 502) r2
    WHERE n.n <= 1400
),
c2 AS (
    SELECT c.n, pu.UserId AS FollowerId, am.UserId AS AuthorId, pu.CreatedAt AS UserCreated, a.CreatedAt AS AuthorCreated,
           dd = ROW_NUMBER() OVER (PARTITION BY pu.UserId, am.UserId ORDER BY c.n)
    FROM cand c
    JOIN seed.Pool pu ON pu.rk = c.uRk
    JOIN seed.AuthorMap am ON am.k = c.aK
    JOIN dbo.Author a ON a.UserId = am.UserId
    WHERE pu.UserId <> am.UserId
)
INSERT dbo.AuthorFollow (FollowerId, AuthorId, CreatedAt)
SELECT TOP (800) c2.FollowerId, c2.AuthorId,
       DATEADD(SECOND, CAST(r3.r * DATEDIFF(SECOND, lo.v, p.RefNow) AS INT), lo.v)
FROM c2
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(c2.n, 503) r3
CROSS APPLY (SELECT v = CASE WHEN c2.UserCreated > c2.AuthorCreated THEN c2.UserCreated ELSE c2.AuthorCreated END) lo
WHERE c2.dd = 1
ORDER BY c2.n;
GO

/* ---------- Follow: readers follow published stories ---------- */
DECLARE @P INT = (SELECT COUNT(*) FROM seed.Pool);
DECLARE @S INT = (SELECT COUNT(*) FROM seed.PubStory);
;WITH cand AS (
    SELECT n.n,
           uRk = 1 + CAST(FLOOR(@P * r1.r) AS INT),
           sRk = 1 + CAST(FLOOR(@S * POWER(r2.r, 2)) AS INT)
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 511) r1
    CROSS APPLY seed.fn_Rnd(n.n, 512) r2
    WHERE n.n <= 4000
),
c2 AS (
    SELECT c.n, pu.UserId, ps.StoryId, pu.CreatedAt AS UserCreated, ps.PublishedAt,
           dd = ROW_NUMBER() OVER (PARTITION BY pu.UserId, ps.StoryId ORDER BY c.n)
    FROM cand c
    JOIN seed.Pool pu ON pu.rk = c.uRk
    JOIN seed.PubStory ps ON ps.rk = c.sRk
)
INSERT dbo.Follow (UserId, StoryId, CreatedAt)
SELECT TOP (2000) c2.UserId, c2.StoryId,
       DATEADD(SECOND, CAST(r3.r * DATEDIFF(SECOND, lo.v, p.RefNow) AS INT), lo.v)
FROM c2
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(c2.n, 513) r3
CROSS APPLY (SELECT v = CASE WHEN c2.UserCreated > c2.PublishedAt THEN c2.UserCreated ELSE c2.PublishedAt END) lo
WHERE c2.dd = 1
ORDER BY c2.n;
GO

/* ---------- Rating: 1-5 stars skewed to 4-5, ~40% with a review that matches the score ---------- */
DECLARE @P INT = (SELECT COUNT(*) FROM seed.Pool);
DECLARE @S INT = (SELECT COUNT(*) FROM seed.PubStory);
;WITH cand AS (
    SELECT n.n,
           uRk = 1 + CAST(FLOOR(@P * r1.r) AS INT),
           sRk = 1 + CAST(FLOOR(@S * POWER(r2.r, 2)) AS INT)
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 521) r1
    CROSS APPLY seed.fn_Rnd(n.n, 522) r2
    WHERE n.n <= 3000
),
c2 AS (
    SELECT c.n, pu.UserId, ps.StoryId, pu.CreatedAt AS UserCreated, ps.PublishedAt,
           dd = ROW_NUMBER() OVER (PARTITION BY pu.UserId, ps.StoryId ORDER BY c.n)
    FROM cand c
    JOIN seed.Pool pu ON pu.rk = c.uRk
    JOIN seed.PubStory ps ON ps.rk = c.sRk
    WHERE ps.AuthorUserId <> pu.UserId                       -- RB4: nobody rates his own story
),
pick AS (SELECT TOP (1200) c2.* FROM c2 WHERE c2.dd = 1 ORDER BY c2.n)
INSERT dbo.Rating (UserId, StoryId, Score, Review, CreatedAt, UpdatedAt)
SELECT pk.UserId, pk.StoryId, sc.Score,
       CASE WHEN rRv.r < 0.4 THEN CASE WHEN sc.Score >= 4 THEN rp.Body WHEN sc.Score = 3 THEN rn.Body ELSE rc.Body END END,
       t.v, t.v
FROM pick pk
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(pk.n, 523) rSc
CROSS APPLY seed.fn_Rnd(pk.n, 524) rRv
CROSS APPLY seed.fn_Rnd(pk.n, 525) rLn
CROSS APPLY seed.fn_Rnd(pk.n, 526) rTm
CROSS APPLY (SELECT Score = CASE WHEN rSc.r < 0.02 THEN 1 WHEN rSc.r < 0.06 THEN 2 WHEN rSc.r < 0.18 THEN 3
                                 WHEN rSc.r < 0.50 THEN 4 ELSE 5 END) sc
CROSS APPLY seed.fn_Lex('RP', '', rLn.r) rp
CROSS APPLY seed.fn_Lex('RN', '', rLn.r) rn
CROSS APPLY seed.fn_Lex('RC', '', rLn.r) rc
CROSS APPLY (SELECT v = DATEADD(SECOND, CAST(rTm.r * DATEDIFF(SECOND,
                        CASE WHEN pk.UserCreated > pk.PublishedAt THEN pk.UserCreated ELSE pk.PublishedAt END, p.RefNow) AS INT),
                        CASE WHEN pk.UserCreated > pk.PublishedAt THEN pk.UserCreated ELSE pk.PublishedAt END)) t
ORDER BY pk.n;
GO

/* ---------- ReadingHistory: one last-read chapter per (user, story), the chapter belongs to the story ---------- */
DECLARE @P INT = (SELECT COUNT(*) FROM seed.Pool);
DECLARE @S INT = (SELECT COUNT(*) FROM seed.PubStory);
;WITH cand AS (
    SELECT n.n,
           uRk = 1 + CAST(FLOOR(@P * r1.r) AS INT),
           sRk = 1 + CAST(FLOOR(@S * POWER(r2.r, 2)) AS INT),
           r3.r AS rCh
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 531) r1
    CROSS APPLY seed.fn_Rnd(n.n, 532) r2
    CROSS APPLY seed.fn_Rnd(n.n, 533) r3
    WHERE n.n <= 2600
),
c2 AS (
    SELECT c.n, pu.UserId, ps.StoryId, pu.CreatedAt AS UserCreated, ch.ChapterId, ch.PublishedAt AS ChapterPublished,
           dd = ROW_NUMBER() OVER (PARTITION BY pu.UserId, ps.StoryId ORDER BY c.n)
    FROM cand c
    JOIN seed.Pool pu ON pu.rk = c.uRk
    JOIN seed.PubStory ps ON ps.rk = c.sRk
    JOIN dbo.Chapter ch ON ch.StoryId = ps.StoryId
                       AND ch.ChapterNo = 1 + CAST(FLOOR(c.rCh * ps.ChPublished) AS INT)
)
INSERT dbo.ReadingHistory (UserId, StoryId, LastChapterId, ScrollPercent, UpdatedAt)
SELECT TOP (1500) c2.UserId, c2.StoryId, c2.ChapterId,
       CAST(ROUND(r4.r * 100, 2) AS DECIMAL(5,2)),
       DATEADD(SECOND, CAST(r5.r * DATEDIFF(SECOND, lo.v, p.RefNow) AS INT), lo.v)
FROM c2
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(c2.n, 534) r4
CROSS APPLY seed.fn_Rnd(c2.n, 535) r5
CROSS APPLY (SELECT v = CASE WHEN c2.UserCreated > c2.ChapterPublished THEN c2.UserCreated ELSE c2.ChapterPublished END) lo
WHERE c2.dd = 1
ORDER BY c2.n;
GO

/* ---------- ReadingList: reader01 owns lists 1 and 2, the other 148 belong to random readers ---------- */
DROP TABLE IF EXISTS seed.ListPlan;
CREATE TABLE seed.ListPlan (
    ln         INT           NOT NULL PRIMARY KEY,
    UserId     INT           NOT NULL,
    Name       NVARCHAR(100) NOT NULL,
    IsPublic   BIT           NOT NULL,
    ItemCnt    INT           NOT NULL,
    CreatedAt  DATETIME2(3)  NOT NULL,
    ListId     INT           NULL
);
GO

DECLARE @P INT = (SELECT COUNT(*) FROM seed.Pool);
INSERT seed.ListPlan (ln, UserId, Name, IsPublic, ItemCnt, CreatedAt)
SELECT v.ln, m.UserId, v.Name, v.IsPublic, v.ItemCnt,
       DATEADD(SECOND, CAST(0.3 * DATEDIFF(SECOND, m.CreatedAt, p.RefNow) AS INT), m.CreatedAt)
FROM (VALUES (1, N'Đang đọc', 0, 4), (2, N'Yêu thích', 1, 3)) v (ln, Name, IsPublic, ItemCnt)
JOIN seed.UserMap m ON m.n = 34
CROSS JOIN seed.Param p;

;WITH cand AS (
    SELECT n.n, uRk = 1 + CAST(FLOOR(@P * r1.r) AS INT), nm = 1 + CAST(FLOOR(10 * r2.r) AS INT), r3.r AS rPub, r4.r AS rCnt, r5.r AS rTm
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 541) r1
    CROSS APPLY seed.fn_Rnd(n.n, 542) r2
    CROSS APPLY seed.fn_Rnd(n.n, 543) r3
    CROSS APPLY seed.fn_Rnd(n.n, 544) r4
    CROSS APPLY seed.fn_Rnd(n.n, 545) r5
    WHERE n.n <= 260
),
c2 AS (
    SELECT c.n, pu.UserId, pu.CreatedAt AS UserCreated, lst.Body AS Name, c.rPub, c.rCnt, c.rTm,
           dd = ROW_NUMBER() OVER (PARTITION BY pu.UserId, c.nm ORDER BY c.n)
    FROM cand c
    JOIN seed.Pool pu ON pu.rk = c.uRk
    JOIN seed.Lex lst ON lst.Kind = 'LST' AND lst.Slug = '' AND lst.Idx = c.nm
),
pick AS (SELECT TOP (148) c2.* FROM c2 WHERE c2.dd = 1 ORDER BY c2.n)
INSERT seed.ListPlan (ln, UserId, Name, IsPublic, ItemCnt, CreatedAt)
SELECT 2 + ROW_NUMBER() OVER (ORDER BY pk.n), pk.UserId, pk.Name,
       CASE WHEN pk.rPub < 0.3 THEN 1 ELSE 0 END,
       1 + CAST(FLOOR(pk.rCnt * 12) AS INT),
       DATEADD(SECOND, CAST(pk.rTm * DATEDIFF(SECOND, pk.UserCreated, p.RefNow) AS INT), pk.UserCreated)
FROM pick pk CROSS JOIN seed.Param p;
GO

INSERT dbo.ReadingList (UserId, Name, IsPublic, CreatedAt, UpdatedAt)
SELECT lp.UserId, lp.Name, lp.IsPublic, lp.CreatedAt, lp.CreatedAt
FROM seed.ListPlan lp
ORDER BY lp.ln;

UPDATE lp SET ListId = rl.ListId
FROM seed.ListPlan lp
JOIN dbo.ReadingList rl ON rl.UserId = lp.UserId AND rl.Name = lp.Name;
GO

DECLARE @S INT = (SELECT COUNT(*) FROM seed.PubStory);
;WITH cand AS (
    SELECT lp.ln, j = k.n, lp.ItemCnt,
           sRk = 1 + CAST(FLOOR(@S * POWER(r.r, 2)) AS INT)
    FROM seed.ListPlan lp
    JOIN seed.Nums k ON k.n <= CASE WHEN lp.ItemCnt + 2 > 12 THEN 12 ELSE lp.ItemCnt + 2 END
    CROSS APPLY seed.fn_Rnd(lp.ln * 32 + k.n, 551) r
),
dd AS (SELECT *, rn = ROW_NUMBER() OVER (PARTITION BY ln, sRk ORDER BY j) FROM cand),
ranked AS (SELECT *, rk = ROW_NUMBER() OVER (PARTITION BY ln ORDER BY j) FROM dd WHERE rn = 1)
INSERT dbo.ReadingListItem (ListId, StoryId, OrderNo, AddedAt)
SELECT lp.ListId, ps.StoryId, rk.rk,
       DATEADD(SECOND, CAST(r2.r * DATEDIFF(SECOND, lo.v, p.RefNow) AS INT), lo.v)
FROM ranked rk
JOIN seed.ListPlan lp ON lp.ln = rk.ln
JOIN seed.PubStory ps ON ps.rk = rk.sRk
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(rk.ln * 32 + rk.j, 552) r2
CROSS APPLY (SELECT v = CASE WHEN lp.CreatedAt > ps.PublishedAt THEN lp.CreatedAt ELSE ps.PublishedAt END) lo
WHERE rk.rk <= rk.ItemCnt;
GO

/* ---------- reader01: fixed demo data ---------- */
DECLARE @r1 INT = (SELECT UserId FROM seed.UserMap WHERE n = 34);
DECLARE @r1Created DATETIME2(3) = (SELECT CreatedAt FROM seed.UserMap WHERE n = 34);
DECLARE @a1 INT = (SELECT UserId FROM seed.AuthorMap WHERE k = 1);
DECLARE @a1Created DATETIME2(3) = (SELECT CreatedAt FROM dbo.Author WHERE UserId = @a1);
DECLARE @now DATETIME2(3) = (SELECT RefNow FROM seed.Param);

-- follows the 5 hottest published stories and author01
INSERT dbo.Follow (UserId, StoryId, CreatedAt)
SELECT @r1, ps.StoryId,
       DATEADD(SECOND, CAST(0.5 * DATEDIFF(SECOND, lo.v, @now) AS INT), lo.v)
FROM seed.PubStory ps
CROSS APPLY (SELECT v = CASE WHEN @r1Created > ps.PublishedAt THEN @r1Created ELSE ps.PublishedAt END) lo
WHERE ps.rk <= 5;

INSERT dbo.AuthorFollow (FollowerId, AuthorId, CreatedAt)
SELECT @r1, @a1, DATEADD(SECOND, CAST(0.5 * DATEDIFF(SECOND, lo.v, @now) AS INT), lo.v)
FROM (SELECT v = CASE WHEN @r1Created > @a1Created THEN @r1Created ELSE @a1Created END) lo;

-- 8 reading-history rows
INSERT dbo.ReadingHistory (UserId, StoryId, LastChapterId, ScrollPercent, UpdatedAt)
SELECT @r1, ps.StoryId, ch.ChapterId, ps.rk * 10,
       DATEADD(SECOND, CAST(0.7 * DATEDIFF(SECOND, lo.v, @now) AS INT), lo.v)
FROM seed.PubStory ps
JOIN dbo.Chapter ch ON ch.StoryId = ps.StoryId AND ch.ChapterNo = 1 + (CAST(ps.rk AS INT) * 3) % ps.ChPublished
CROSS APPLY (SELECT v = CASE WHEN @r1Created > ch.PublishedAt THEN @r1Created ELSE ch.PublishedAt END) lo
WHERE ps.rk <= 8;

-- 3 ratings with reviews
INSERT dbo.Rating (UserId, StoryId, Score, Review, CreatedAt, UpdatedAt)
SELECT @r1, ps.StoryId, x.Score, x.Review,
       DATEADD(SECOND, CAST(0.6 * DATEDIFF(SECOND, lo.v, @now) AS INT), lo.v),
       DATEADD(SECOND, CAST(0.6 * DATEDIFF(SECOND, lo.v, @now) AS INT), lo.v)
FROM seed.PubStory ps
JOIN (VALUES (1, 5, N'Truyện hay, cốt truyện cuốn hút, đọc một mạch không dừng được.'),
             (2, 4, N'Văn phong mượt mà, tình tiết hợp lý, đáng đọc từ đầu đến cuối.'),
             (3, 3, N'Truyện ổn, đoạn đầu hơi chậm nhưng càng về sau càng hấp dẫn.')) x (rk, Score, Review) ON x.rk = ps.rk
CROSS APPLY (SELECT v = CASE WHEN @r1Created > ps.PublishedAt THEN @r1Created ELSE ps.PublishedAt END) lo;
GO

/* ---------- ReadingListItem for the reader01 lists is generated above (lists 1 and 2) ---------- */

/* ---------- StoryViewDaily: last 90 days, only after a story went public ---------- */
INSERT dbo.StoryViewDaily (StoryId, ViewDate, Views)
SELECT sp.StoryId,
       CAST(DATEADD(HOUR, 7, DATEADD(DAY, -(k.n - 1), p.RefNow)) AS DATE),
       CASE WHEN x.v < 1 THEN 1 ELSE x.v END
FROM seed.StoryPlan sp
CROSS JOIN seed.Param p
JOIN seed.Nums k ON k.n <= 90
CROSS APPLY seed.fn_Rnd(CAST(sp.n AS BIGINT) * 128 + k.n, 561) r
CROSS APPLY (SELECT v = CAST(ROUND(600.0 / POWER(CAST(sp.n AS FLOAT), 0.85) * (0.5 + r.r), 0) AS INT)) x
WHERE sp.Status <> 'DRAFT'
  AND DATEADD(DAY, -(k.n - 1), p.RefNow) >= DATEADD(DAY, DATEDIFF(DAY, 0, sp.PublishedAt), 0);
GO

/* ---------- checks ---------- */
IF EXISTS (SELECT 1 FROM dbo.Rating r JOIN dbo.Story s ON s.StoryId = r.StoryId WHERE r.UserId = s.AuthorId)
    THROW 50121, N'50_activity: an author rated his own story.', 1;
IF EXISTS (SELECT 1 FROM dbo.ReadingHistory h JOIN dbo.Chapter c ON c.ChapterId = h.LastChapterId WHERE c.StoryId <> h.StoryId)
    THROW 50121, N'50_activity: a reading-history row points to a chapter of another story.', 1;
IF EXISTS (SELECT 1 FROM dbo.Rating r JOIN dbo.[User] u ON u.UserId = r.UserId WHERE u.Role = 'ADMIN')
    THROW 50121, N'50_activity: an admin has a rating.', 1;
GO

SELECT (SELECT COUNT(*) FROM dbo.AuthorFollow)    AS AuthorFollows,
       (SELECT COUNT(*) FROM dbo.Follow)          AS Follows,
       (SELECT COUNT(*) FROM dbo.Rating)          AS Ratings,
       (SELECT COUNT(*) FROM dbo.Rating WHERE Review IS NOT NULL) AS RatingsWithReview,
       (SELECT COUNT(*) FROM dbo.ReadingHistory)  AS ReadingHistory,
       (SELECT COUNT(*) FROM dbo.ReadingList)     AS ReadingLists,
       (SELECT COUNT(*) FROM dbo.ReadingListItem) AS ReadingListItems,
       (SELECT COUNT(*) FROM dbo.StoryViewDaily)  AS StoryViewDailyRows;
SELECT Score, COUNT(*) AS Ratings FROM dbo.Rating GROUP BY Score ORDER BY Score;
GO
