/*
 * 01_tables.sql   [RDS OK]
 *
 * The 18 tables of NovelleDB (docs/data-dictionary.md section 4). Run as novelle_migrator:
 *
 *   sqlcmd -S <rds-endpoint>,1433 -U novelle_migrator -P <password> -d NovelleDB -C -b -f 65001 -i 01_tables.sql
 *
 * Conventions:
 *  - Idempotent: every table is created only if it does not exist yet.
 *  - All foreign keys use NO ACTION (stories and chapters are soft-deleted, nothing cascades).
 *  - Columns marked "derived" are maintained by triggers, procedures or services (data-dictionary section 5).
 *  - `User` is a reserved word in T-SQL, so the table is always written [User].
 *  - Chapter(StoryId, ChapterNo) uniqueness is a unique index created in 02_indexes.sql.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ===================== 4.1 Users ===================== */

IF OBJECT_ID(N'dbo.[User]', N'U') IS NULL
CREATE TABLE dbo.[User] (
    UserId        INT IDENTITY(1,1)  NOT NULL,
    Username      VARCHAR(50)        NOT NULL,
    Email         VARCHAR(255)       NOT NULL,
    PasswordHash  VARCHAR(100)       NOT NULL,           -- BCrypt
    DisplayName   NVARCHAR(100)      NOT NULL,
    AvatarUrl     VARCHAR(500)       NULL,
    Bio           NVARCHAR(1000)     NULL,
    Role          VARCHAR(10)        NOT NULL CONSTRAINT DF_User_Role   DEFAULT 'READER',
    Status        VARCHAR(10)        NOT NULL CONSTRAINT DF_User_Status DEFAULT 'ACTIVE',
    BanReason     NVARCHAR(500)      NULL,
    BannedBy      INT                NULL,               -- the ADMIN who banned the user
    BannedAt      DATETIME2(3)       NULL,
    LastLoginAt   DATETIME2(3)       NULL,
    CreatedAt     DATETIME2(3)       NOT NULL CONSTRAINT DF_User_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt     DATETIME2(3)       NOT NULL CONSTRAINT DF_User_UpdatedAt DEFAULT SYSUTCDATETIME(),
    RowVer        ROWVERSION         NOT NULL,           -- optimistic lock
    CONSTRAINT PK_User          PRIMARY KEY (UserId),
    CONSTRAINT UQ_User_Username UNIQUE (Username),
    CONSTRAINT UQ_User_Email    UNIQUE (Email),
    CONSTRAINT FK_User_BannedBy FOREIGN KEY (BannedBy) REFERENCES dbo.[User] (UserId),
    -- 3-50 characters of [a-z0-9_]; the binary collation makes the range check case-sensitive
    CONSTRAINT CK_User_Username CHECK (LEN(Username) >= 3
                                       AND Username COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9_]%'),
    CONSTRAINT CK_User_Role     CHECK (Role   IN ('READER', 'AUTHOR', 'ADMIN')),
    CONSTRAINT CK_User_Status   CHECK (Status IN ('ACTIVE', 'BANNED'))
);
GO

IF OBJECT_ID(N'dbo.AuthorRequest', N'U') IS NULL
CREATE TABLE dbo.AuthorRequest (
    RequestId        INT IDENTITY(1,1) NOT NULL,
    UserId           INT               NOT NULL,         -- applicant, must be an ACTIVE READER (RB14)
    ProposedPenName  NVARCHAR(100)     NOT NULL,
    Introduction     NVARCHAR(2000)    NOT NULL,
    Status           VARCHAR(10)       NOT NULL CONSTRAINT DF_AuthorRequest_Status DEFAULT 'PENDING',
    ReviewedBy       INT               NULL,             -- the ADMIN who decided
    ReviewedAt       DATETIME2(3)      NULL,
    ReviewNote       NVARCHAR(500)     NULL,
    CreatedAt        DATETIME2(3)      NOT NULL CONSTRAINT DF_AuthorRequest_CreatedAt DEFAULT SYSUTCDATETIME(),
    RowVer           ROWVERSION        NOT NULL,         -- detects two admins deciding the same request
    CONSTRAINT PK_AuthorRequest          PRIMARY KEY (RequestId),
    CONSTRAINT FK_AuthorRequest_User     FOREIGN KEY (UserId)     REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_AuthorRequest_Reviewer FOREIGN KEY (ReviewedBy) REFERENCES dbo.[User] (UserId),
    CONSTRAINT CK_AuthorRequest_Status   CHECK (Status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT CK_AuthorRequest_Reviewer CHECK (Status NOT IN ('APPROVED', 'REJECTED') OR ReviewedBy IS NOT NULL)
);
GO

-- AUTHOR subclass of USER (mapping option 8A: the key is both PK and FK).
IF OBJECT_ID(N'dbo.Author', N'U') IS NULL
CREATE TABLE dbo.Author (
    UserId             INT            NOT NULL,
    PenName            NVARCHAR(100)  NOT NULL,
    Bio                NVARCHAR(2000) NULL,
    IsVerified         BIT            NOT NULL CONSTRAINT DF_Author_IsVerified    DEFAULT 0,
    ApprovedRequestId  INT            NOT NULL,          -- the APPROVED request this profile came from (RB13)
    FollowerCount      INT            NOT NULL CONSTRAINT DF_Author_FollowerCount DEFAULT 0,   -- derived
    CreatedAt          DATETIME2(3)   NOT NULL CONSTRAINT DF_Author_CreatedAt     DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Author                  PRIMARY KEY (UserId),
    CONSTRAINT UQ_Author_PenName          UNIQUE (PenName),
    CONSTRAINT UQ_Author_ApprovedRequest  UNIQUE (ApprovedRequestId),
    CONSTRAINT FK_Author_User             FOREIGN KEY (UserId)            REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_Author_ApprovedRequest  FOREIGN KEY (ApprovedRequestId) REFERENCES dbo.AuthorRequest (RequestId)
);
GO

IF OBJECT_ID(N'dbo.AuthorFollow', N'U') IS NULL
CREATE TABLE dbo.AuthorFollow (
    FollowerId  INT          NOT NULL,
    AuthorId    INT          NOT NULL,
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_AuthorFollow_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_AuthorFollow          PRIMARY KEY (FollowerId, AuthorId),
    CONSTRAINT FK_AuthorFollow_Follower FOREIGN KEY (FollowerId) REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_AuthorFollow_Author   FOREIGN KEY (AuthorId)   REFERENCES dbo.Author (UserId),
    CONSTRAINT CK_AuthorFollow_NotSelf  CHECK (FollowerId <> AuthorId)
);
GO

/* ===================== 4.2 Content ===================== */

IF OBJECT_ID(N'dbo.Genre', N'U') IS NULL
CREATE TABLE dbo.Genre (
    GenreId     SMALLINT IDENTITY(1,1) NOT NULL,
    Name        NVARCHAR(50)  NOT NULL,
    Slug        VARCHAR(60)   NOT NULL,
    Description NVARCHAR(500) NULL,
    SortOrder   SMALLINT      NOT NULL CONSTRAINT DF_Genre_SortOrder DEFAULT 0,
    CONSTRAINT PK_Genre      PRIMARY KEY (GenreId),
    CONSTRAINT UQ_Genre_Name UNIQUE (Name),
    CONSTRAINT UQ_Genre_Slug UNIQUE (Slug)
);
GO

IF OBJECT_ID(N'dbo.Tag', N'U') IS NULL
CREATE TABLE dbo.Tag (
    TagId       INT IDENTITY(1,1) NOT NULL,
    Name        NVARCHAR(50) NOT NULL,
    Slug        VARCHAR(60)  NOT NULL,
    UsageCount  INT          NOT NULL CONSTRAINT DF_Tag_UsageCount DEFAULT 0,   -- derived
    CONSTRAINT PK_Tag      PRIMARY KEY (TagId),
    CONSTRAINT UQ_Tag_Name UNIQUE (Name),
    CONSTRAINT UQ_Tag_Slug UNIQUE (Slug)
);
GO

IF OBJECT_ID(N'dbo.Story', N'U') IS NULL
CREATE TABLE dbo.Story (
    StoryId           INT IDENTITY(1,1) NOT NULL,
    AuthorId          INT            NOT NULL,
    Title             NVARCHAR(300)  NOT NULL,
    Slug              VARCHAR(350)   NOT NULL,
    Description       NVARCHAR(4000) NULL,
    CoverUrl          VARCHAR(500)   NULL,
    AgeRating         VARCHAR(5)     NOT NULL CONSTRAINT DF_Story_AgeRating         DEFAULT 'ALL',
    CompletionStatus  VARCHAR(10)    NOT NULL CONSTRAINT DF_Story_CompletionStatus  DEFAULT 'ONGOING',
    PublishStatus     VARCHAR(10)    NOT NULL CONSTRAINT DF_Story_PublishStatus     DEFAULT 'DRAFT',
    HiddenReason      NVARCHAR(500)  NULL,
    ChapterCount      INT            NOT NULL CONSTRAINT DF_Story_ChapterCount      DEFAULT 0,   -- derived
    WordCount         BIGINT         NOT NULL CONSTRAINT DF_Story_WordCount         DEFAULT 0,   -- derived
    ViewCount         BIGINT         NOT NULL CONSTRAINT DF_Story_ViewCount         DEFAULT 0,   -- derived (Redis flush)
    FollowCount       INT            NOT NULL CONSTRAINT DF_Story_FollowCount       DEFAULT 0,   -- derived
    RatingAvg         DECIMAL(3,2)   NOT NULL CONSTRAINT DF_Story_RatingAvg         DEFAULT 0,   -- derived
    RatingCount       INT            NOT NULL CONSTRAINT DF_Story_RatingCount       DEFAULT 0,   -- derived
    LastChapterAt     DATETIME2(3)   NULL,                                                       -- derived
    PublishedAt       DATETIME2(3)   NULL,                                   -- first time made public
    IsDeleted         BIT            NOT NULL CONSTRAINT DF_Story_IsDeleted         DEFAULT 0,
    DeletedAt         DATETIME2(3)   NULL,
    CreatedAt         DATETIME2(3)   NOT NULL CONSTRAINT DF_Story_CreatedAt         DEFAULT SYSUTCDATETIME(),
    UpdatedAt         DATETIME2(3)   NOT NULL CONSTRAINT DF_Story_UpdatedAt         DEFAULT SYSUTCDATETIME(),
    RowVer            ROWVERSION     NOT NULL,
    CONSTRAINT PK_Story        PRIMARY KEY (StoryId),
    CONSTRAINT UQ_Story_Slug   UNIQUE (Slug),
    CONSTRAINT FK_Story_Author FOREIGN KEY (AuthorId) REFERENCES dbo.Author (UserId),
    CONSTRAINT CK_Story_AgeRating        CHECK (AgeRating        IN ('ALL', '13+', '18+')),
    CONSTRAINT CK_Story_CompletionStatus CHECK (CompletionStatus IN ('ONGOING', 'COMPLETED', 'HIATUS')),
    CONSTRAINT CK_Story_PublishStatus    CHECK (PublishStatus    IN ('DRAFT', 'PUBLISHED', 'HIDDEN'))
);
GO

IF OBJECT_ID(N'dbo.StoryGenre', N'U') IS NULL
CREATE TABLE dbo.StoryGenre (
    StoryId    INT      NOT NULL,
    GenreId    SMALLINT NOT NULL,
    IsPrimary  BIT      NOT NULL CONSTRAINT DF_StoryGenre_IsPrimary DEFAULT 0,   -- at most one per story: filtered unique index in 02
    CONSTRAINT PK_StoryGenre       PRIMARY KEY (StoryId, GenreId),
    CONSTRAINT FK_StoryGenre_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId),
    CONSTRAINT FK_StoryGenre_Genre FOREIGN KEY (GenreId) REFERENCES dbo.Genre (GenreId)
);
GO

IF OBJECT_ID(N'dbo.StoryTag', N'U') IS NULL
CREATE TABLE dbo.StoryTag (
    StoryId  INT NOT NULL,
    TagId    INT NOT NULL,
    CONSTRAINT PK_StoryTag       PRIMARY KEY (StoryId, TagId),
    CONSTRAINT FK_StoryTag_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId),
    CONSTRAINT FK_StoryTag_Tag   FOREIGN KEY (TagId)   REFERENCES dbo.Tag (TagId)
);
GO

-- Weak entity of Story: surrogate key + natural key UQ(StoryId, VolumeNo).
IF OBJECT_ID(N'dbo.Volume', N'U') IS NULL
CREATE TABLE dbo.Volume (
    VolumeId   INT IDENTITY(1,1) NOT NULL,
    StoryId    INT           NOT NULL,
    VolumeNo   SMALLINT      NOT NULL,
    Title      NVARCHAR(200) NOT NULL,
    CreatedAt  DATETIME2(3)  NOT NULL CONSTRAINT DF_Volume_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Volume        PRIMARY KEY (VolumeId),
    CONSTRAINT UQ_Volume_Story_No UNIQUE (StoryId, VolumeNo),
    CONSTRAINT FK_Volume_Story  FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId)
);
GO

-- Weak entity of Story: surrogate key; the natural key (StoryId, ChapterNo) is a unique index in 02_indexes.sql.
IF OBJECT_ID(N'dbo.Chapter', N'U') IS NULL
CREATE TABLE dbo.Chapter (
    ChapterId    BIGINT IDENTITY(1,1) NOT NULL,
    StoryId      INT            NOT NULL,
    VolumeId     INT            NULL,                    -- NULL when the story has no volumes (RB7: same story)
    ChapterNo    INT            NOT NULL,
    Title        NVARCHAR(300)  NOT NULL,
    Content      NVARCHAR(MAX)  NOT NULL,                -- sanitized HTML
    WordCount    INT            NOT NULL CONSTRAINT DF_Chapter_WordCount DEFAULT 0,   -- derived (application)
    Status       VARCHAR(10)    NOT NULL CONSTRAINT DF_Chapter_Status    DEFAULT 'DRAFT',
    ScheduledAt  DATETIME2(3)   NULL,
    PublishedAt  DATETIME2(3)   NULL,
    ViewCount    BIGINT         NOT NULL CONSTRAINT DF_Chapter_ViewCount DEFAULT 0,   -- derived (Redis flush)
    IsDeleted    BIT            NOT NULL CONSTRAINT DF_Chapter_IsDeleted DEFAULT 0,
    CreatedAt    DATETIME2(3)   NOT NULL CONSTRAINT DF_Chapter_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2(3)   NOT NULL CONSTRAINT DF_Chapter_UpdatedAt DEFAULT SYSUTCDATETIME(),
    RowVer       ROWVERSION     NOT NULL,                -- concurrent edit detection (HTTP 409)
    CONSTRAINT PK_Chapter        PRIMARY KEY (ChapterId),
    CONSTRAINT FK_Chapter_Story  FOREIGN KEY (StoryId)  REFERENCES dbo.Story (StoryId),
    CONSTRAINT FK_Chapter_Volume FOREIGN KEY (VolumeId) REFERENCES dbo.Volume (VolumeId),
    CONSTRAINT CK_Chapter_No        CHECK (ChapterNo > 0),
    CONSTRAINT CK_Chapter_Status    CHECK (Status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED')),
    CONSTRAINT CK_Chapter_Scheduled CHECK (Status <> 'SCHEDULED' OR ScheduledAt IS NOT NULL),
    CONSTRAINT CK_Chapter_Published CHECK (Status <> 'PUBLISHED' OR PublishedAt IS NOT NULL)
);
GO

-- Append-only history (RB10, enforced by trg_ChapterRevision_Immutable). Keeps the 10 newest per chapter.
IF OBJECT_ID(N'dbo.ChapterRevision', N'U') IS NULL
CREATE TABLE dbo.ChapterRevision (
    RevisionId   BIGINT IDENTITY(1,1) NOT NULL,
    ChapterId    BIGINT         NOT NULL,
    RevisionNo   INT            NOT NULL,
    Title        NVARCHAR(300)  NOT NULL,
    Content      NVARCHAR(MAX)  NOT NULL,
    WordCount    INT            NOT NULL,
    EditedBy     INT            NOT NULL,                -- the author who made the edit
    CreatedAt    DATETIME2(3)   NOT NULL CONSTRAINT DF_ChapterRevision_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ChapterRevision          PRIMARY KEY (RevisionId),
    CONSTRAINT UQ_ChapterRevision_Chapter_No UNIQUE (ChapterId, RevisionNo),
    CONSTRAINT FK_ChapterRevision_Chapter  FOREIGN KEY (ChapterId) REFERENCES dbo.Chapter (ChapterId),
    CONSTRAINT FK_ChapterRevision_Author   FOREIGN KEY (EditedBy)  REFERENCES dbo.Author (UserId)
);
GO

/* ===================== 4.3 Reader activity ===================== */

-- LAST_READ: one position per user per story (RB5) enforced by the primary key.
IF OBJECT_ID(N'dbo.ReadingHistory', N'U') IS NULL
CREATE TABLE dbo.ReadingHistory (
    UserId         INT           NOT NULL,
    StoryId        INT           NOT NULL,
    LastChapterId  BIGINT        NOT NULL,               -- must belong to StoryId (RB5, checked by service and 99_check_invariants)
    ScrollPercent  DECIMAL(5,2)  NOT NULL CONSTRAINT DF_ReadingHistory_Scroll    DEFAULT 0,
    UpdatedAt      DATETIME2(3)  NOT NULL CONSTRAINT DF_ReadingHistory_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReadingHistory         PRIMARY KEY (UserId, StoryId),
    CONSTRAINT FK_ReadingHistory_User    FOREIGN KEY (UserId)        REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_ReadingHistory_Story   FOREIGN KEY (StoryId)       REFERENCES dbo.Story (StoryId),
    CONSTRAINT FK_ReadingHistory_Chapter FOREIGN KEY (LastChapterId) REFERENCES dbo.Chapter (ChapterId),
    CONSTRAINT CK_ReadingHistory_Scroll  CHECK (ScrollPercent BETWEEN 0 AND 100)
);
GO

IF OBJECT_ID(N'dbo.Follow', N'U') IS NULL
CREATE TABLE dbo.Follow (
    UserId     INT          NOT NULL,
    StoryId    INT          NOT NULL,
    CreatedAt  DATETIME2(3) NOT NULL CONSTRAINT DF_Follow_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Follow       PRIMARY KEY (UserId, StoryId),
    CONSTRAINT FK_Follow_User  FOREIGN KEY (UserId)  REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_Follow_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId)
);
GO

IF OBJECT_ID(N'dbo.ReadingList', N'U') IS NULL
CREATE TABLE dbo.ReadingList (
    ListId       INT IDENTITY(1,1) NOT NULL,
    UserId       INT           NOT NULL,
    Name         NVARCHAR(100) NOT NULL,
    Description  NVARCHAR(500) NULL,
    IsPublic     BIT           NOT NULL CONSTRAINT DF_ReadingList_IsPublic  DEFAULT 0,
    ItemCount    INT           NOT NULL CONSTRAINT DF_ReadingList_ItemCount DEFAULT 0,   -- derived
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_ReadingList_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_ReadingList_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReadingList           PRIMARY KEY (ListId),
    CONSTRAINT UQ_ReadingList_User_Name UNIQUE (UserId, Name),
    CONSTRAINT FK_ReadingList_User      FOREIGN KEY (UserId) REFERENCES dbo.[User] (UserId)
);
GO

IF OBJECT_ID(N'dbo.ReadingListItem', N'U') IS NULL
CREATE TABLE dbo.ReadingListItem (
    ListId   INT           NOT NULL,
    StoryId  INT           NOT NULL,
    OrderNo  INT           NOT NULL,
    Note     NVARCHAR(300) NULL,
    AddedAt  DATETIME2(3)  NOT NULL CONSTRAINT DF_ReadingListItem_AddedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReadingListItem       PRIMARY KEY (ListId, StoryId),
    CONSTRAINT FK_ReadingListItem_List  FOREIGN KEY (ListId)  REFERENCES dbo.ReadingList (ListId),
    CONSTRAINT FK_ReadingListItem_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId)
);
GO

IF OBJECT_ID(N'dbo.Rating', N'U') IS NULL
CREATE TABLE dbo.Rating (
    UserId     INT            NOT NULL,
    StoryId    INT            NOT NULL,
    Score      TINYINT        NOT NULL,
    Review     NVARCHAR(1000) NULL,
    CreatedAt  DATETIME2(3)   NOT NULL CONSTRAINT DF_Rating_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt  DATETIME2(3)   NOT NULL CONSTRAINT DF_Rating_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Rating       PRIMARY KEY (UserId, StoryId),
    CONSTRAINT FK_Rating_User  FOREIGN KEY (UserId)  REFERENCES dbo.[User] (UserId),
    CONSTRAINT FK_Rating_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId),
    CONSTRAINT CK_Rating_Score CHECK (Score BETWEEN 1 AND 5)
);
GO

-- Weak entity of Story; ViewDate is a calendar date in Vietnam time.
IF OBJECT_ID(N'dbo.StoryViewDaily', N'U') IS NULL
CREATE TABLE dbo.StoryViewDaily (
    StoryId   INT   NOT NULL,
    ViewDate  DATE  NOT NULL,
    Views     INT   NOT NULL CONSTRAINT DF_StoryViewDaily_Views DEFAULT 0,
    CONSTRAINT PK_StoryViewDaily       PRIMARY KEY (StoryId, ViewDate),
    CONSTRAINT FK_StoryViewDaily_Story FOREIGN KEY (StoryId) REFERENCES dbo.Story (StoryId),
    CONSTRAINT CK_StoryViewDaily_Views CHECK (Views >= 0)
);
GO

SELECT COUNT(*) AS TableCount FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo');   -- expect 18
GO
