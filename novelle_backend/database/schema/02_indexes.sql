/*
 * 02_indexes.sql   [RDS OK]
 *
 * Indexes beyond the primary keys and UNIQUE constraints (docs/data-dictionary.md section 4.4),
 * plus the unique indexes that enforce business rules and Chapter(StoryId, ChapterNo).
 * Idempotent: each index is created only if no index with that name exists on the table.
 * Filtered indexes need QUOTED_IDENTIFIER ON and use literal predicates only.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ---------- Unique indexes that enforce business rules ---------- */

-- Natural key of the weak entity CHAPTER, covering the table of contents (F3, F4).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Chapter_Story_No' AND object_id = OBJECT_ID(N'dbo.Chapter'))
    CREATE UNIQUE NONCLUSTERED INDEX IX_Chapter_Story_No
        ON dbo.Chapter (StoryId, ChapterNo)
        INCLUDE (Title, Status, PublishedAt);
GO

-- RB14: at most one PENDING author request per user.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AuthorRequest_Pending' AND object_id = OBJECT_ID(N'dbo.AuthorRequest'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_AuthorRequest_Pending
        ON dbo.AuthorRequest (UserId)
        WHERE Status = 'PENDING';
GO

-- RB6: at most one primary genre per story.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StoryGenre_Primary' AND object_id = OBJECT_ID(N'dbo.StoryGenre'))
    CREATE UNIQUE NONCLUSTERED INDEX UX_StoryGenre_Primary
        ON dbo.StoryGenre (StoryId)
        WHERE IsPrimary = 1;
GO

/* ---------- Performance indexes ---------- */

-- F1: newest-updated public stories.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Story_Public_LastChapter' AND object_id = OBJECT_ID(N'dbo.Story'))
    CREATE NONCLUSTERED INDEX IX_Story_Public_LastChapter
        ON dbo.Story (LastChapterAt DESC)
        INCLUDE (Title, CoverUrl, ChapterCount, AuthorId)
        WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0;
GO

-- F3, F8, F10: stories of an author.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Story_Author' AND object_id = OBJECT_ID(N'dbo.Story'))
    CREATE NONCLUSTERED INDEX IX_Story_Author ON dbo.Story (AuthorId);
GO

-- F1, F2: sort by views / rating.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Story_ViewCount' AND object_id = OBJECT_ID(N'dbo.Story'))
    CREATE NONCLUSTERED INDEX IX_Story_ViewCount ON dbo.Story (ViewCount DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Story_RatingAvg' AND object_id = OBJECT_ID(N'dbo.Story'))
    CREATE NONCLUSTERED INDEX IX_Story_RatingAvg ON dbo.Story (RatingAvg DESC);
GO

-- F2: filter by genre / tag (the primary key already covers StoryId -> GenreId / TagId).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StoryGenre_Genre' AND object_id = OBJECT_ID(N'dbo.StoryGenre'))
    CREATE NONCLUSTERED INDEX IX_StoryGenre_Genre ON dbo.StoryGenre (GenreId, StoryId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StoryTag_Tag' AND object_id = OBJECT_ID(N'dbo.StoryTag'))
    CREATE NONCLUSTERED INDEX IX_StoryTag_Tag ON dbo.StoryTag (TagId, StoryId);
GO

-- Scheduled-publish job (RB11).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Chapter_Scheduled' AND object_id = OBJECT_ID(N'dbo.Chapter'))
    CREATE NONCLUSTERED INDEX IX_Chapter_Scheduled
        ON dbo.Chapter (ScheduledAt)
        WHERE Status = 'SCHEDULED';
GO

-- F5: library, "continue reading" ordered by recency.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ReadingHistory_User_Updated' AND object_id = OBJECT_ID(N'dbo.ReadingHistory'))
    CREATE NONCLUSTERED INDEX IX_ReadingHistory_User_Updated ON dbo.ReadingHistory (UserId, UpdatedAt DESC);
GO

-- F10: count / list the followers of a story or an author.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Follow_Story' AND object_id = OBJECT_ID(N'dbo.Follow'))
    CREATE NONCLUSTERED INDEX IX_Follow_Story ON dbo.Follow (StoryId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthorFollow_Author' AND object_id = OBJECT_ID(N'dbo.AuthorFollow'))
    CREATE NONCLUSTERED INDEX IX_AuthorFollow_Author ON dbo.AuthorFollow (AuthorId);
GO

-- F3, F6: latest reviews of a story.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Rating_Story' AND object_id = OBJECT_ID(N'dbo.Rating'))
    CREATE NONCLUSTERED INDEX IX_Rating_Story ON dbo.Rating (StoryId, UpdatedAt DESC) INCLUDE (Score);
GO

-- F11: author-request queue and user filtering.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthorRequest_Status' AND object_id = OBJECT_ID(N'dbo.AuthorRequest'))
    CREATE NONCLUSTERED INDEX IX_AuthorRequest_Status ON dbo.AuthorRequest (Status, CreatedAt);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_User_Role_Status' AND object_id = OBJECT_ID(N'dbo.[User]'))
    CREATE NONCLUSTERED INDEX IX_User_Role_Status ON dbo.[User] (Role, Status);
GO

-- F10, F13: views per day across stories.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StoryViewDaily_Date' AND object_id = OBJECT_ID(N'dbo.StoryViewDaily'))
    CREATE NONCLUSTERED INDEX IX_StoryViewDaily_Date ON dbo.StoryViewDaily (ViewDate) INCLUDE (Views);
GO

SELECT COUNT(*) AS IndexCount
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
WHERE i.index_id > 0 AND i.is_primary_key = 0 AND i.is_unique_constraint = 0 AND t.schema_id = SCHEMA_ID(N'dbo');   -- expect 17
GO
