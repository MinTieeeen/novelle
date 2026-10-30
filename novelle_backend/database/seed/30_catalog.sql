/*
 * 30_catalog.sql   [RDS OK]   Seed step 3 of 5.
 *
 * 150 stories (128 PUBLISHED, 15 DRAFT, 7 HIDDEN), their genres (1-3, exactly one primary), 60 tags
 * (0-10 per story) and volumes (about 40% of the public stories).
 *
 * The first 5 stories belong to author01 and are the "hot" ones (low StoryId = most popular in step 50):
 *   1 published, ongoing, 3 volumes     2 published, completed     3 DRAFT
 *   4 published, 17 chapters + 2 SCHEDULED + 1 DRAFT (step 40)     5 published
 *
 * Counters (ChapterCount, WordCount, ViewCount, ...) stay 0 here and are computed by 90_finalize.sql.
 * Run with -f 65001.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'seed.AuthorMap') IS NULL
    THROW 50120, N'Run 10_corpus.sql and 20_users.sql first.', 1;
IF EXISTS (SELECT 1 FROM dbo.Story)
    THROW 50100, N'The database already contains stories. Run 99_reset.sql first.', 1;
GO

/* ---------- 1. plan the 150 stories ---------- */
DROP TABLE IF EXISTS seed.StoryPlan;
CREATE TABLE seed.StoryPlan (
    n            INT           NOT NULL PRIMARY KEY,
    AuthorK      INT           NOT NULL,
    Status       VARCHAR(10)   NOT NULL,
    Completion   VARCHAR(10)   NOT NULL,
    AgeRating    VARCHAR(5)    NOT NULL,
    GenreIdx     INT           NOT NULL,      -- Genre.SortOrder of the primary genre
    Extra1       INT           NULL,          -- SortOrder of optional second / third genre
    Extra2       INT           NULL,
    ChCount      INT           NOT NULL,      -- chapters created in step 40
    ChPublished  INT           NOT NULL,      -- how many of them are PUBLISHED (chapters 1..ChPublished)
    VolCount     INT           NOT NULL,      -- 0 = no volumes
    TagCnt       INT           NOT NULL,
    CreatedAt    DATETIME2(3)  NOT NULL,
    PublishedAt  DATETIME2(3)  NULL,
    GenreSlug    VARCHAR(40)   NULL,
    Title        NVARCHAR(300) NULL,
    SlugBase     VARCHAR(350)  NULL,
    Slug         VARCHAR(350)  NULL,
    StoryId      INT           NULL
);
GO

;WITH st AS (            -- stories 6..150: 14 DRAFT, 7 HIDDEN, the rest PUBLISHED, picked in a fixed random order
    SELECT n.n, rk = ROW_NUMBER() OVER (ORDER BY r.r)
    FROM seed.Nums n
    CROSS APPLY seed.fn_Rnd(n.n, 301) r
    WHERE n.n BETWEEN 6 AND 150
)
INSERT seed.StoryPlan (n, AuthorK, Status, Completion, AgeRating, GenreIdx, Extra1, Extra2,
                       ChCount, ChPublished, VolCount, TagCnt, CreatedAt, PublishedAt)
SELECT n.n, a.AuthorK, s.Status, c.Completion, ag.AgeRating, g.GenreIdx, ex.Extra1, ex.Extra2,
       ch.ChCount, ch.ChPublished, v.VolCount, tg.TagCnt, cr.CreatedAt,
       CASE WHEN s.Status = 'DRAFT' THEN NULL
            ELSE DATEADD(SECOND, CAST((1 + 13 * rPub.r) * 86400 AS INT), cr.CreatedAt) END
FROM seed.Nums n
CROSS JOIN seed.Param p
LEFT JOIN st ON st.n = n.n
CROSS APPLY seed.fn_Rnd(n.n, 300) rAu
CROSS APPLY seed.fn_Rnd(n.n, 302) rCo
CROSS APPLY seed.fn_Rnd(n.n, 303) rAg
CROSS APPLY seed.fn_Rnd(n.n, 304) rGe
CROSS APPLY seed.fn_Rnd(n.n, 305) rEn
CROSS APPLY seed.fn_Rnd(n.n, 306) rO1
CROSS APPLY seed.fn_Rnd(n.n, 307) rO2
CROSS APPLY seed.fn_Rnd(n.n, 312) rCh
CROSS APPLY seed.fn_Rnd(n.n, 313) rVp
CROSS APPLY seed.fn_Rnd(n.n, 314) rVn
CROSS APPLY seed.fn_Rnd(n.n, 315) rCr
CROSS APPLY seed.fn_Rnd(n.n, 316) rPub
CROSS APPLY seed.fn_Rnd(n.n, 320) rTg
CROSS APPLY (SELECT AuthorK = CASE WHEN n.n <= 5 THEN 1 ELSE 1 + CAST(FLOOR(30 * POWER(rAu.r, 1.6)) AS INT) END) a
CROSS APPLY (SELECT Status = CASE WHEN n.n = 3 THEN 'DRAFT'
                                  WHEN n.n <= 5 THEN 'PUBLISHED'
                                  WHEN st.rk <= 14 THEN 'DRAFT'
                                  WHEN st.rk <= 21 THEN 'HIDDEN'
                                  ELSE 'PUBLISHED' END) s
CROSS APPLY (SELECT Completion = CASE WHEN n.n = 2 THEN 'COMPLETED'
                                      WHEN n.n IN (1, 4, 5) OR s.Status = 'DRAFT' THEN 'ONGOING'
                                      WHEN rCo.r < 0.30 THEN 'COMPLETED'
                                      WHEN rCo.r < 0.34 THEN 'HIATUS'
                                      ELSE 'ONGOING' END) c
CROSS APPLY (SELECT AgeRating = CASE WHEN rAg.r < 0.70 THEN 'ALL' WHEN rAg.r < 0.90 THEN '13+' ELSE '18+' END) ag
CROSS APPLY (SELECT GenreIdx = 1 + CAST(FLOOR(20 * POWER(rGe.r, 1.3)) AS INT)) g
CROSS APPLY (SELECT cnt  = CAST(FLOOR(rEn.r * 3) AS INT),                                    -- 0, 1 or 2 extra genres
                    off1 = 1 + CAST(FLOOR(rO1.r * 19) AS INT),                               -- 1..19
                    off2raw = 1 + CAST(FLOOR(rO2.r * 18) AS INT)) e0                         -- 1..18
CROSS APPLY (SELECT Extra1 = CASE WHEN e0.cnt >= 1 THEN ((g.GenreIdx - 1 + e0.off1) % 20) + 1 END,
                    Extra2 = CASE WHEN e0.cnt >= 2
                                  THEN ((g.GenreIdx - 1 + CASE WHEN e0.off2raw >= e0.off1 THEN e0.off2raw + 1 ELSE e0.off2raw END) % 20) + 1 END) ex
CROSS APPLY (SELECT ChCount = CASE WHEN n.n = 3 THEN 3
                                   WHEN n.n = 4 THEN 20
                                   WHEN s.Status = 'DRAFT' THEN 1 + CAST(FLOOR(rCh.r * 8) AS INT)
                                   ELSE 10 + CAST(FLOOR(rCh.r * 31) AS INT) END) ch0
CROSS APPLY (SELECT ChCount = ch0.ChCount,
                    ChPublished = CASE WHEN s.Status = 'DRAFT' THEN 0 WHEN n.n = 4 THEN 17 ELSE ch0.ChCount END) ch
CROSS APPLY (SELECT VolCount = CASE WHEN n.n = 1 THEN 3
                                    WHEN n.n <= 5 OR s.Status = 'DRAFT' THEN 0
                                    WHEN rVp.r < 0.40 THEN 2 + CAST(FLOOR(rVn.r * 3) AS INT)
                                    ELSE 0 END) v
CROSS APPLY (SELECT TagCnt = CAST(FLOOR(POWER(rTg.r, 1.3) * 11) AS INT)) tg
CROSS APPLY (SELECT CreatedAt = DATEADD(SECOND,
                        -CAST(ROUND((60 + rCr.r * CASE WHEN s.Status = 'DRAFT' THEN 240 ELSE 540 END) * 86400, 0) AS INT),
                        p.RefNow)) cr
WHERE n.n <= 150
ORDER BY n.n;
GO

/* genre slug, title and unique slug */
UPDATE sp
SET GenreSlug = g.Slug,
    Title     = CONCAT(tn.Body, N' ', ta.Body, CASE WHEN rE.r < 0.4 THEN CONCAT(N' ', te.Body) ELSE N'' END)
FROM seed.StoryPlan sp
JOIN dbo.Genre g ON g.SortOrder = sp.GenreIdx
CROSS APPLY seed.fn_Rnd(sp.n, 308) rN
CROSS APPLY seed.fn_Rnd(sp.n, 309) rA
CROSS APPLY seed.fn_Rnd(sp.n, 310) rE
CROSS APPLY seed.fn_Rnd(sp.n, 311) rT
CROSS APPLY seed.fn_Lex('TN', g.Slug, rN.r) tn
CROSS APPLY seed.fn_Lex('TA', g.Slug, rA.r) ta
CROSS APPLY seed.fn_Lex('TE', '', rT.r) te;

UPDATE sp SET SlugBase = x.slug
FROM seed.StoryPlan sp CROSS APPLY seed.fn_Slug(sp.Title) x;

;WITH d AS (SELECT n, SlugBase, rn = ROW_NUMBER() OVER (PARTITION BY SlugBase ORDER BY n) FROM seed.StoryPlan)
UPDATE sp SET Slug = CASE WHEN d.rn = 1 THEN d.SlugBase ELSE CONCAT(d.SlugBase, '-', d.rn) END
FROM seed.StoryPlan sp JOIN d ON d.n = sp.n;
GO

/* ---------- 2. insert the stories ---------- */
INSERT dbo.Story (AuthorId, Title, Slug, Description, CoverUrl, AgeRating, CompletionStatus, PublishStatus,
                  HiddenReason, PublishedAt, CreatedAt, UpdatedAt)
SELECT am.UserId, sp.Title, sp.Slug,
       CONCAT(d1.Body, N' ', d2.Body, CASE WHEN rD.r < 0.5 THEN CONCAT(N' ', d3.Body) ELSE N'' END),
       CASE WHEN sp.Status = 'DRAFT' AND rC.r < 0.5 THEN NULL
            ELSE CONCAT('/covers/', sp.GenreSlug, '/', RIGHT(CONCAT('0', 1 + CAST(FLOOR(rC2.r * 8) AS INT)), 2), '.jpg') END,
       sp.AgeRating, sp.Completion, sp.Status,
       CASE WHEN sp.Status = 'HIDDEN' THEN hid.Body END,
       sp.PublishedAt, sp.CreatedAt, sp.CreatedAt
FROM seed.StoryPlan sp
JOIN seed.AuthorMap am ON am.k = sp.AuthorK
CROSS APPLY seed.fn_Rnd(sp.n, 330) rS
CROSS APPLY seed.fn_Rnd(sp.n, 331) rD
CROSS APPLY seed.fn_Rnd(sp.n, 332) rC
CROSS APPLY seed.fn_Rnd(sp.n, 333) rC2
CROSS APPLY seed.fn_Rnd(sp.n, 334) rH
CROSS APPLY (SELECT a = 1 + CAST(FLOOR(rS.r * 3) AS INT)) k
JOIN seed.Lex d1 ON d1.Kind = 'DS' AND d1.Slug = sp.GenreSlug AND d1.Idx = k.a
JOIN seed.Lex d2 ON d2.Kind = 'DS' AND d2.Slug = sp.GenreSlug AND d2.Idx = (k.a % 3) + 1
JOIN seed.Lex d3 ON d3.Kind = 'DS' AND d3.Slug = sp.GenreSlug AND d3.Idx = ((k.a + 1) % 3) + 1
CROSS APPLY seed.fn_Lex('HID', '', rH.r) hid
ORDER BY sp.n;

UPDATE sp SET StoryId = s.StoryId
FROM seed.StoryPlan sp JOIN dbo.Story s ON s.Slug = sp.Slug;
GO

/* ---------- 3. genres: primary + up to two others ---------- */
INSERT dbo.StoryGenre (StoryId, GenreId, IsPrimary)
SELECT sp.StoryId, g.GenreId, x.IsPrimary
FROM seed.StoryPlan sp
CROSS APPLY (VALUES (sp.GenreIdx, 1), (sp.Extra1, 0), (sp.Extra2, 0)) x (SortOrder, IsPrimary)
JOIN dbo.Genre g ON g.SortOrder = x.SortOrder
WHERE x.SortOrder IS NOT NULL;
GO

/* ---------- 4. tags ---------- */
INSERT dbo.Tag (Name, Slug)
SELECT l.Body, sl.slug
FROM seed.Lex l
CROSS APPLY seed.fn_Slug(l.Body) sl
WHERE l.Kind = 'TAG'
ORDER BY l.Idx;

DROP TABLE IF EXISTS seed.TagMap;
SELECT l.Idx, t.TagId
INTO seed.TagMap
FROM seed.Lex l JOIN dbo.Tag t ON t.Name = l.Body
WHERE l.Kind = 'TAG';
GO

-- 0..10 distinct tags per story, popular tags drawn more often
;WITH cand AS (
    SELECT sp.n AS sn, j = k.n, sp.TagCnt,
           tagIdx = 1 + CAST(FLOOR(60 * POWER(r.r, 1.8)) AS INT)
    FROM seed.StoryPlan sp
    JOIN seed.Nums k ON k.n <= CASE WHEN sp.TagCnt + 3 > 10 THEN 10 ELSE sp.TagCnt + 3 END
    CROSS APPLY seed.fn_Rnd(sp.n * 100 + k.n, 321) r
    WHERE sp.TagCnt > 0
),
dd AS (SELECT *, rn = ROW_NUMBER() OVER (PARTITION BY sn, tagIdx ORDER BY j) FROM cand),
ranked AS (SELECT *, rk = ROW_NUMBER() OVER (PARTITION BY sn ORDER BY j) FROM dd WHERE rn = 1)
INSERT dbo.StoryTag (StoryId, TagId)
SELECT sp.StoryId, tm.TagId
FROM ranked rk
JOIN seed.StoryPlan sp ON sp.n = rk.sn
JOIN seed.TagMap tm ON tm.Idx = rk.tagIdx
WHERE rk.rk <= rk.TagCnt;
GO

/* ---------- 5. volumes ---------- */
INSERT dbo.Volume (StoryId, VolumeNo, Title, CreatedAt)
SELECT sp.StoryId, k.n, CONCAT(N'Quyển ', k.n), sp.PublishedAt
FROM seed.StoryPlan sp
JOIN seed.Nums k ON k.n <= sp.VolCount
WHERE sp.VolCount > 0
ORDER BY sp.n, k.n;
GO

/* ---------- checks ---------- */
IF EXISTS (SELECT 1 FROM dbo.Story WHERE Slug COLLATE Latin1_General_100_BIN2 LIKE '%[^a-z0-9-]%')
    THROW 50122, N'30_catalog: a story slug has characters outside [a-z0-9-].', 1;
IF (SELECT COUNT(*) FROM dbo.Story) <> 150
   OR (SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'PUBLISHED') <> 128
   OR (SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'DRAFT') <> 15
   OR (SELECT COUNT(*) FROM dbo.Story WHERE PublishStatus = 'HIDDEN') <> 7
   OR (SELECT COUNT(*) FROM dbo.Tag) <> 60
    THROW 50121, N'30_catalog: unexpected row counts.', 1;
IF EXISTS (SELECT 1 FROM seed.StoryPlan WHERE StoryId IS NULL)
    THROW 50121, N'30_catalog: a planned story was not inserted.', 1;
GO

SELECT PublishStatus, COUNT(*) AS Stories FROM dbo.Story GROUP BY PublishStatus ORDER BY PublishStatus;
SELECT CompletionStatus, COUNT(*) AS Stories FROM dbo.Story GROUP BY CompletionStatus ORDER BY CompletionStatus;
SELECT (SELECT COUNT(*) FROM dbo.StoryGenre) AS StoryGenres, (SELECT COUNT(*) FROM dbo.StoryTag) AS StoryTags,
       (SELECT COUNT(*) FROM dbo.Volume) AS Volumes, (SELECT COUNT(*) FROM seed.StoryPlan WHERE VolCount > 0) AS StoriesWithVolumes;
SELECT TOP 5 StoryId, Slug, PublishStatus, CompletionStatus, CoverUrl FROM dbo.Story ORDER BY StoryId;
GO
