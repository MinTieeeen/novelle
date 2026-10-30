/*
 * 40_chapters.sql   [RDS OK]   Seed step 4 of 5.
 *
 * Chapters (about 3,300) with HTML content built from the sentence corpus, and about 1,000 revisions.
 *
 *  - Public stories: chapters 1..n PUBLISHED, spread evenly from the story's PublishedAt up to now.
 *  - DRAFT stories: all chapters DRAFT.
 *  - Story 4 of author01: chapters 1..17 PUBLISHED, 18 and 19 SCHEDULED (tomorrow and the day after), 20 DRAFT.
 *  - Content: 70-169 sentences (about 1,500-3,500 words), 5 sentences per <p>, the first sentence unique per chapter.
 *  - Revisions: 22% of the published chapters get 1-3 older versions (the content minus its first 1-3 paragraphs).
 *
 * Counters on Story are computed by 90_finalize.sql. Run with -f 65001.
 * If the t3.micro instance is short of memory, split this file by ranges of seed.StoryPlan.n.
 */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID(N'seed.StoryPlan') IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Story)
    THROW 50120, N'Run 10_corpus.sql ... 30_catalog.sql first.', 1;
IF EXISTS (SELECT 1 FROM dbo.Chapter)
    THROW 50100, N'The database already contains chapters. Run 99_reset.sql first.', 1;
GO

/* ---------- 1. plan every chapter ----------
 * Steps 1-3 are resumable: a table that already exists (from an interrupted run) is kept and only the missing
 * part is built. 99_reset.sql drops the whole `seed` schema, so a fresh run always starts clean. */
IF OBJECT_ID(N'seed.ChapterPlan') IS NULL
CREATE TABLE seed.ChapterPlan (
    ChapterKey   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StoryN       INT           NOT NULL,
    StoryId      INT           NOT NULL,
    ChapterNo    INT           NOT NULL,
    SentCount    INT           NOT NULL,
    Status       VARCHAR(10)   NOT NULL,
    VolumeNo     INT           NULL,
    Title        NVARCHAR(300) NOT NULL,
    PublishedAt  DATETIME2(3)  NULL,
    ScheduledAt  DATETIME2(3)  NULL,
    CreatedAt    DATETIME2(3)  NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM seed.ChapterPlan)
INSERT seed.ChapterPlan (StoryN, StoryId, ChapterNo, SentCount, Status, VolumeNo, Title, PublishedAt, ScheduledAt, CreatedAt)
SELECT sp.n, sp.StoryId, k.n,
       70 + CAST(FLOOR(rS.r * 100) AS INT),
       st.Status,
       CASE WHEN sp.VolCount > 0 THEN 1 + ((k.n - 1) * sp.VolCount) / sp.ChCount END,
       CONCAT(N'Chương ', k.n, N': ', ph.Body),
       CASE WHEN st.Status = 'PUBLISHED' THEN DATEADD(MINUTE, (k.n - 1) * step.v, sp.PublishedAt) END,
       CASE WHEN st.Status = 'SCHEDULED' THEN DATEADD(DAY, k.n - 17, p.RefNow) END,
       CASE WHEN st.Status = 'PUBLISHED' THEN DATEADD(MINUTE, (k.n - 1) * step.v, sp.PublishedAt)
            WHEN sp.Status = 'DRAFT'     THEN DATEADD(DAY, k.n, sp.CreatedAt)
            ELSE DATEADD(MINUTE, 16 * step.v, sp.PublishedAt) END                  -- story 4: drafted after chapter 17
FROM seed.StoryPlan sp
CROSS JOIN seed.Param p
JOIN (SELECT TOP (200) n FROM seed.Nums ORDER BY n) k ON k.n <= sp.ChCount     -- small number table: no full scans
CROSS APPLY seed.fn_Rnd(sp.n * 256 + k.n, 401) rS
CROSS APPLY seed.fn_Rnd(sp.n * 256 + k.n, 403) rT
CROSS APPLY seed.fn_Lex('CHT', '', rT.r) ph
CROSS APPLY (SELECT Status = CASE WHEN sp.Status = 'DRAFT' THEN 'DRAFT'
                                  WHEN sp.n = 4 AND k.n IN (18, 19) THEN 'SCHEDULED'
                                  WHEN sp.n = 4 AND k.n = 20 THEN 'DRAFT'
                                  ELSE 'PUBLISHED' END) st
CROSS APPLY (SELECT v = CASE WHEN sp.PublishedAt IS NULL THEN 0
                             ELSE DATEDIFF(MINUTE, sp.PublishedAt, p.RefNow) / (sp.ChPublished + 1) END) step
ORDER BY sp.n, k.n;
GO

/* ---------- 2. which sentence goes where ---------- */
IF OBJECT_ID(N'seed.ChapterSent') IS NULL
CREATE TABLE seed.ChapterSent (
    ChapterKey  INT      NOT NULL,
    k           SMALLINT NOT NULL,
    SentIdx     SMALLINT NOT NULL,
    PRIMARY KEY (ChapterKey, k)
);
GO

DECLARE @cnt INT = (SELECT COUNT(*) FROM seed.Lex WHERE Kind = 'SENT' AND Slug = '');
IF NOT EXISTS (SELECT 1 FROM seed.ChapterSent)
INSERT seed.ChapterSent (ChapterKey, k, SentIdx)
SELECT cp.ChapterKey, k.n, 1 + CAST(FLOOR(r.r * @cnt) AS INT)
FROM seed.ChapterPlan cp
JOIN (SELECT TOP (200) n FROM seed.Nums ORDER BY n) k ON k.n <= cp.SentCount
CROSS APPLY seed.fn_Rnd(CAST(cp.ChapterKey AS BIGINT) * 256 + k.n, 402) r
OPTION (MAXDOP 1);
GO

/* ---------- 3. build the HTML text: sentences -> paragraphs of 5 -> chapter ---------- */
IF OBJECT_ID(N'seed.ChapterText') IS NULL
CREATE TABLE seed.ChapterText (
    ChapterKey  INT           NOT NULL PRIMARY KEY,
    Content     NVARCHAR(MAX) NOT NULL,
    WordCount   INT           NOT NULL
);
GO

-- One aggregation level only (a two-level STRING_AGG over NVARCHAR(MAX) was far too slow on a t3.micro):
-- every sentence carries its own separator, a paragraph break after each 5th sentence.
-- Built in slices of 250 chapters. OPTION (RECOMPILE) turns @lo/@hi into constants so the optimizer always
-- picks the index seek on seed.ChapterSent; the message after each slice shows progress and keeps the
-- connection to RDS from sitting silent for minutes.
-- Resumes after the last finished slice (each slice is one atomic INSERT, so MAX(ChapterKey) + 1 is a slice start).
DECLARE @lo INT = ISNULL((SELECT MAX(ChapterKey) FROM seed.ChapterText), 0) + 1, @step INT = 250,
        @max INT = (SELECT MAX(ChapterKey) FROM seed.ChapterPlan), @msg NVARCHAR(100);
WHILE @lo <= @max
BEGIN
    INSERT seed.ChapterText (ChapterKey, Content, WordCount)
    SELECT cs.ChapterKey,
           CONCAT(N'<p>', STRING_AGG(CAST(x.Piece AS NVARCHAR(MAX)), N'') WITHIN GROUP (ORDER BY cs.k), N'</p>'),
           SUM(x.Words)
    FROM seed.ChapterSent cs
    JOIN seed.ChapterPlan cp ON cp.ChapterKey = cs.ChapterKey
    JOIN seed.StoryPlan sp ON sp.n = cp.StoryN
    JOIN seed.Lex l ON l.Kind = 'SENT' AND l.Slug = '' AND l.Idx = cs.SentIdx
    CROSS APPLY (SELECT Body = CASE WHEN cs.k = 1
                                    THEN CONCAT(N'Đây là chương ', cp.ChapterNo, N' của truyện ', sp.Title, N'.')
                                    ELSE l.Body END) b
    CROSS APPLY (SELECT Piece = CONCAT(b.Body, CASE WHEN cs.k >= cp.SentCount THEN N''
                                                    WHEN cs.k % 5 = 0 THEN N'</p><p>'
                                                    ELSE N' ' END),
                        Words = LEN(b.Body) - LEN(REPLACE(b.Body, N' ', N'')) + 1) x
    WHERE cs.ChapterKey BETWEEN @lo AND @lo + @step - 1
    GROUP BY cs.ChapterKey
    OPTION (RECOMPILE);

    SET @msg = CONCAT(N'chapter text built up to ChapterKey ', CASE WHEN @lo + @step - 1 > @max THEN @max ELSE @lo + @step - 1 END, N' of ', @max);
    RAISERROR (@msg, 0, 1) WITH NOWAIT;
    SET @lo += @step;
END
GO

IF (SELECT COUNT(*) FROM seed.ChapterText) <> (SELECT COUNT(*) FROM seed.ChapterPlan)
    THROW 50121, N'40_chapters: the chapter text table does not cover every planned chapter.', 1;
GO

/* ---------- 4. insert the chapters ---------- */
INSERT dbo.Chapter (StoryId, VolumeId, ChapterNo, Title, Content, WordCount, Status, ScheduledAt, PublishedAt, CreatedAt, UpdatedAt)
SELECT cp.StoryId, v.VolumeId, cp.ChapterNo, cp.Title, ct.Content, ct.WordCount,
       cp.Status, cp.ScheduledAt, cp.PublishedAt, cp.CreatedAt, cp.CreatedAt
FROM seed.ChapterPlan cp
JOIN seed.ChapterText ct ON ct.ChapterKey = cp.ChapterKey
LEFT JOIN dbo.Volume v ON v.StoryId = cp.StoryId AND v.VolumeNo = cp.VolumeNo
ORDER BY cp.ChapterKey;
GO

/* ---------- 5. revisions (older versions of some published chapters) ---------- */
INSERT dbo.ChapterRevision (ChapterId, RevisionNo, Title, Content, WordCount, EditedBy, CreatedAt)
SELECT c.ChapterId, j.n, c.Title, rc.x,
       (LEN(rc.x) - LEN(REPLACE(rc.x, N' ', N''))) + ((LEN(rc.x) - LEN(REPLACE(rc.x, N'</p>', N''))) / 4),
       s.AuthorId,
       DATEADD(MINUTE, DATEDIFF(MINUTE, c.PublishedAt, p.RefNow) * j.n / (k.cnt + 1), c.PublishedAt)
FROM dbo.Chapter c
JOIN dbo.Story s ON s.StoryId = c.StoryId
CROSS JOIN seed.Param p
CROSS APPLY seed.fn_Rnd(c.ChapterId, 410) r1
CROSS APPLY seed.fn_Rnd(c.ChapterId, 411) r2
CROSS APPLY (SELECT cnt = 1 + CAST(FLOOR(r2.r * 3) AS INT)) k
JOIN (SELECT TOP (3) n FROM seed.Nums ORDER BY n) j ON j.n <= k.cnt
CROSS APPLY (SELECT p1 = CHARINDEX(N'</p>', c.Content) + 4) a
CROSS APPLY (SELECT p2 = CHARINDEX(N'</p>', c.Content, a.p1) + 4) b
CROSS APPLY (SELECT p3 = CHARINDEX(N'</p>', c.Content, b.p2) + 4) d
CROSS APPLY (SELECT x = SUBSTRING(c.Content, CHOOSE(j.n, a.p1, b.p2, d.p3), LEN(c.Content))) rc
WHERE c.Status = 'PUBLISHED' AND r1.r < 0.22
ORDER BY c.ChapterId, j.n;
GO

/* ---------- checks ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo.Chapter)
    THROW 50121, N'40_chapters: no chapters were inserted.', 1;
IF (SELECT COUNT(*) FROM dbo.Chapter) <> (SELECT COUNT(*) FROM seed.ChapterPlan)
    THROW 50121, N'40_chapters: chapter count differs from the plan.', 1;
IF EXISTS (SELECT 1 FROM dbo.Chapter WHERE Status = 'PUBLISHED' AND PublishedAt IS NULL)
    THROW 50121, N'40_chapters: a published chapter has no PublishedAt.', 1;
GO

SELECT Status, COUNT(*) AS Chapters, AVG(WordCount) AS AvgWords, MIN(WordCount) AS MinWords, MAX(WordCount) AS MaxWords
FROM dbo.Chapter GROUP BY Status ORDER BY Status;
SELECT COUNT(*) AS Revisions, COUNT(DISTINCT ChapterId) AS RevisedChapters FROM dbo.ChapterRevision;
SELECT SUM(DATALENGTH(Content)) / 1048576 AS ChapterContentMB FROM dbo.Chapter;
SELECT TOP 6 s.StoryId, c.ChapterNo, c.Status, c.ScheduledAt FROM dbo.Chapter c JOIN dbo.Story s ON s.StoryId = c.StoryId
WHERE s.StoryId = (SELECT StoryId FROM seed.StoryPlan WHERE n = 4) AND c.ChapterNo >= 16 ORDER BY c.ChapterNo;
GO
