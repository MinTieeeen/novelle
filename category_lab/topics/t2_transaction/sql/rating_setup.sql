/*
 * T3 sandbox: one story and its ratings (F6).
 *   transaction__Rating      as dbo.Rating, with IX_Rating_Story and a copy of dbo.trg_Rating (06_triggers.sql):
 *                            every INSERT recomputes Story.RatingAvg / RatingCount from all ratings of the story.
 *   transaction__RatingPlain the same table without the trigger, for the incremental variant.
 *   transaction__Story       the derived columns, plus RatingSum used by the incremental variant.
 * A trigger belongs to its table, so dropping the table (runner, `lab clean`) drops the trigger too.
 */
DROP TABLE IF EXISTS lab.transaction__Rating;
DROP TABLE IF EXISTS lab.transaction__RatingPlain;
DROP TABLE IF EXISTS lab.transaction__Story;
GO
CREATE TABLE lab.transaction__Story (
    StoryId      INT           NOT NULL CONSTRAINT PK_transaction__Story PRIMARY KEY,
    Title        NVARCHAR(300) NOT NULL,
    RatingAvg    DECIMAL(3,2)  NOT NULL CONSTRAINT DF_transaction__Story_RatingAvg   DEFAULT 0,
    RatingCount  INT           NOT NULL CONSTRAINT DF_transaction__Story_RatingCount DEFAULT 0,
    RatingSum    INT           NOT NULL CONSTRAINT DF_transaction__Story_RatingSum   DEFAULT 0
);
CREATE TABLE lab.transaction__Rating (
    UserId     INT          NOT NULL,
    StoryId    INT          NOT NULL,
    Score      TINYINT      NOT NULL CONSTRAINT CK_transaction__Rating_Score CHECK (Score BETWEEN 1 AND 5),
    CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_transaction__Rating_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_transaction__Rating_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_transaction__Rating PRIMARY KEY (UserId, StoryId)
);
CREATE NONCLUSTERED INDEX IX_transaction__Rating_Story
    ON lab.transaction__Rating (StoryId, UpdatedAt DESC) INCLUDE (Score);
CREATE TABLE lab.transaction__RatingPlain (
    UserId     INT          NOT NULL,
    StoryId    INT          NOT NULL,
    Score      TINYINT      NOT NULL CONSTRAINT CK_transaction__RatingPlain_Score CHECK (Score BETWEEN 1 AND 5),
    CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_transaction__RatingPlain_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_transaction__RatingPlain_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_transaction__RatingPlain PRIMARY KEY (UserId, StoryId)
);
GO
CREATE TRIGGER lab.transaction__trg_Rating
ON lab.transaction__Rating
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    UPDATE s
    SET RatingAvg   = COALESCE(x.AvgScore, 0),
        RatingCount = COALESCE(x.RatingCount, 0)
    FROM lab.transaction__Story s
    JOIN (SELECT StoryId FROM inserted UNION SELECT StoryId FROM deleted) t ON t.StoryId = s.StoryId
    OUTER APPLY (SELECT CAST(AVG(CAST(r.Score AS DECIMAL(5,2))) AS DECIMAL(3,2)) AS AvgScore,
                        COUNT(*)                                                 AS RatingCount
                 FROM lab.transaction__Rating r
                 WHERE r.StoryId = s.StoryId) x;
END
