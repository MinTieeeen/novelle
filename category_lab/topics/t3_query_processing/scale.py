"""Bigger copies of the web data, so the optimizer meets more rows and its plans can change.

tables(ctx, n) builds, for n = 150 / 1k / 10k stories, copies of dbo.Story, dbo.Author, dbo.StoryGenre and
dbo.StoryViewDaily (lab.query_processing__Story_<n>, __Author_<n>, __StoryGenre_<n>, __ViewDaily_<n>; each
story copy brings the daily views of its original story) with the same indexes as the web schema
(02_indexes.sql). The rows of dbo.Story are repeated until there are n stories; every copy keeps the values
of its original row (statuses, ratings, genres ...) but gets its own StoryId, Title, Slug and author: the
site grows by new authors, as a real one would, so an author keeps ~4 stories at every size. (Keeping the
AuthorId instead would give every author 67x more stories at 10k: the share of matching rows, and so the
plan, would never change.) dbo.Genre does not grow and is read as is.

The indexes are a given condition of the web, not something this topic compares. dbo.* is only read; the
lab drops the copies after the topic. sqlserver.py and redis.py read the same copies, so the two DBMSs
work on the same data.
"""
from lab.framework import Ctx
from lab.framework.fixtures import ensure_schema, sandbox_name


SIZES = (150, 1_000, 10_000)

COMMON = """
SET NOCOUNT ON;
DECLARE @copy INT = 1, @base INT = (SELECT COUNT(*) FROM dbo.Story),
        @authors INT = (SELECT MAX(UserId) FROM dbo.Author);
"""

STORY_COLUMNS = ("StoryId, SourceStoryId, AuthorId, Title, Slug, Description, CoverUrl, AgeRating, "
                 "CompletionStatus, PublishStatus, ChapterCount, WordCount, ViewCount, FollowCount, RatingAvg, "
                 "RatingCount, LastChapterAt, PublishedAt, IsDeleted, CreatedAt, UpdatedAt")

STORY_STEPS = (
    """DROP TABLE IF EXISTS {story};
    SELECT TOP (0) CAST(0 AS INT) AS StoryId, s.StoryId + 0 AS SourceStoryId, s.AuthorId,
           CAST(s.Title AS NVARCHAR(300)) AS Title, CAST(s.Slug AS VARCHAR(350)) AS Slug,
           s.Description, s.CoverUrl, s.AgeRating, s.CompletionStatus, s.PublishStatus, s.ChapterCount,
           s.WordCount, s.ViewCount, s.FollowCount, s.RatingAvg, s.RatingCount, s.LastChapterAt, s.PublishedAt,
           s.IsDeleted, s.CreatedAt, s.UpdatedAt
    INTO {story} FROM dbo.Story s;""",
    "ALTER TABLE {story} ALTER COLUMN StoryId INT NOT NULL;",
    """ALTER TABLE {story} ADD CONSTRAINT PK_query_processing__Story_{n} PRIMARY KEY CLUSTERED (StoryId);
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Story_Slug ON {story} (Slug);
    CREATE NONCLUSTERED INDEX IX_Story_Public_LastChapter ON {story} (LastChapterAt DESC)
        INCLUDE (Title, CoverUrl, ChapterCount, AuthorId) WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0;
    CREATE NONCLUSTERED INDEX IX_Story_Author ON {story} (AuthorId);
    CREATE NONCLUSTERED INDEX IX_Story_ViewCount ON {story} (ViewCount DESC);
    CREATE NONCLUSTERED INDEX IX_Story_RatingAvg ON {story} (RatingAvg DESC);""",
    COMMON + """
    WHILE (@copy - 1) * @base < {n}
    BEGIN
        INSERT INTO {story} (""" + STORY_COLUMNS + """)
        SELECT x.NewId, x.StoryId, x.AuthorId + (@copy - 1) * @authors,
               CAST(x.Title + IIF(@copy > 1, N' #' + CAST(@copy AS NVARCHAR(10)), N'') AS NVARCHAR(300)),
               -- "--copy<k>": a plain "-<k>" can collide with a real slug such as "some-title-2"
               CAST(x.Slug + IIF(@copy > 1, '--copy' + CAST(@copy AS VARCHAR(10)), '') AS VARCHAR(350)),
               x.Description, x.CoverUrl, x.AgeRating, x.CompletionStatus, x.PublishStatus, x.ChapterCount,
               x.WordCount, x.ViewCount, x.FollowCount, x.RatingAvg, x.RatingCount, x.LastChapterAt,
               x.PublishedAt, x.IsDeleted, x.CreatedAt, x.UpdatedAt
        FROM (SELECT s.*, (@copy - 1) * @base + CAST(ROW_NUMBER() OVER (ORDER BY s.StoryId) AS INT) AS NewId
              FROM dbo.Story s) x
        WHERE x.NewId <= {n};
        SET @copy += 1;
    END""",
)

AUTHOR_STEPS = (
    """DROP TABLE IF EXISTS {author};
    SELECT TOP (0) a.UserId + 0 AS UserId, CAST(a.PenName AS NVARCHAR(100)) AS PenName, a.IsVerified,
           a.FollowerCount, a.CreatedAt
    INTO {author} FROM dbo.Author a;""",
    "ALTER TABLE {author} ALTER COLUMN UserId INT NOT NULL;",
    """ALTER TABLE {author} ADD CONSTRAINT PK_query_processing__Author_{n} PRIMARY KEY CLUSTERED (UserId);
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Author_PenName ON {author} (PenName);""",
    COMMON + """
    WHILE (@copy - 1) * @base < {n}
    BEGIN
        INSERT INTO {author} (UserId, PenName, IsVerified, FollowerCount, CreatedAt)
        SELECT a.UserId + (@copy - 1) * @authors,
               CAST(a.PenName + IIF(@copy > 1, N' #' + CAST(@copy AS NVARCHAR(10)), N'') AS NVARCHAR(100)),
               a.IsVerified, a.FollowerCount, a.CreatedAt
        FROM dbo.Author a;
        SET @copy += 1;
    END""",
)

STORY_GENRE_STEPS = (
    """DROP TABLE IF EXISTS {story_genre};
    CREATE TABLE {story_genre} (
        StoryId   INT      NOT NULL,
        GenreId   SMALLINT NOT NULL,
        IsPrimary BIT      NOT NULL,
        CONSTRAINT PK_query_processing__StoryGenre_{n} PRIMARY KEY CLUSTERED (StoryId, GenreId));
    CREATE UNIQUE NONCLUSTERED INDEX UX_StoryGenre_Primary ON {story_genre} (StoryId) WHERE IsPrimary = 1;
    CREATE NONCLUSTERED INDEX IX_StoryGenre_Genre ON {story_genre} (GenreId, StoryId);""",
    """SET NOCOUNT ON;
    DECLARE @lo INT = 1;
    WHILE @lo <= {n}
    BEGIN
        INSERT INTO {story_genre} (StoryId, GenreId, IsPrimary)
        SELECT s.StoryId, sg.GenreId, sg.IsPrimary
        FROM {story} s JOIN dbo.StoryGenre sg ON sg.StoryId = s.SourceStoryId
        WHERE s.StoryId BETWEEN @lo AND @lo + 149;
        SET @lo += 150;
    END""",
)

VIEW_DAILY_STEPS = (
    """DROP TABLE IF EXISTS {view_daily};
    CREATE TABLE {view_daily} (
        StoryId  INT  NOT NULL,
        ViewDate DATE NOT NULL,
        Views    INT  NOT NULL,
        CONSTRAINT PK_query_processing__ViewDaily_{n} PRIMARY KEY CLUSTERED (StoryId, ViewDate));
    CREATE NONCLUSTERED INDEX IX_StoryViewDaily_Date ON {view_daily} (ViewDate) INCLUDE (Views);""",
    # ~80 rows per story: 10 stories (~800 rows) per INSERT, Nested Loops on the source's primary key and a
    # cap on the memory grant. With 150 stories (~12k rows) per INSERT the statement asked ~11 MB for its
    # sorts, more than the instance can grant, and waited on RESOURCE_SEMAPHORE ahead of other sessions.
    """SET NOCOUNT ON;
    DECLARE @lo INT = 1;
    WHILE @lo <= {n}
    BEGIN
        INSERT INTO {view_daily} (StoryId, ViewDate, Views)
        SELECT s.StoryId, v.ViewDate, v.Views
        FROM {story} s JOIN dbo.StoryViewDaily v ON v.StoryId = s.SourceStoryId
        WHERE s.StoryId BETWEEN @lo AND @lo + 9
        OPTION (LOOP JOIN, MAX_GRANT_PERCENT = 5);
        SET @lo += 10;
    END""",
)


def tables(ctx: Ctx, n: int) -> dict[str, str]:
    """Names of the n-story copies {"story", "author", "story_genre", "view_daily"}; built once per run.

    A marker table is created last, so a copy left half-built by an interrupted run is rebuilt."""
    topic = ctx.scenario.topic
    names = {"story": sandbox_name(topic, f"Story_{n}"), "author": sandbox_name(topic, f"Author_{n}"),
             "story_genre": sandbox_name(topic, f"StoryGenre_{n}"),
             "view_daily": sandbox_name(topic, f"ViewDaily_{n}")}
    ready = sandbox_name(topic, f"Ready_{n}")
    if ctx.sql.scalar(f"SELECT OBJECT_ID(N'{ready}')") is not None:
        return names
    ensure_schema(ctx.sql)
    for step in STORY_STEPS + AUTHOR_STEPS + STORY_GENRE_STEPS + VIEW_DAILY_STEPS:
        ctx.sql.exec(step.format(n=n, **names))
    count = ctx.sql.scalar(f"SELECT COUNT(*) FROM {names['story']}")
    if count != n:
        raise RuntimeError(f"{names['story']} has {count} rows, expected {n}")
    ctx.sql.exec(f"CREATE TABLE {ready} (Done BIT NOT NULL);")
    return names


def story_table(ctx: Ctx, n: int) -> str:
    return tables(ctx, n)["story"]


def label(name: str, n: int) -> str:
    """Metric label with the table size, e.g. author · 10k."""
    return f"{name} · {n // 1000}k" if n >= 1000 else f"{name} · {n}"


def num(n: int) -> str:
    """1000 -> "1.000" (Vietnamese thousands separator)."""
    return f"{n:,}".replace(",", ".")


def median_author(ctx: Ctx) -> int:
    """The author whose story count is the median of dbo.Story: a typical author page."""
    rows = ctx.sql.query("SELECT AuthorId, COUNT(*) AS n FROM dbo.Story GROUP BY AuthorId ORDER BY n, AuthorId")
    return rows[len(rows) // 2]["AuthorId"]


def popular_genre(ctx: Ctx) -> dict:
    """The genre with the most public stories in dbo.Story: {"GenreId", "Slug", "Name"}."""
    return ctx.sql.query(
        "SELECT TOP (1) g.GenreId, g.Slug, g.Name FROM dbo.Genre g "
        "JOIN dbo.StoryGenre sg ON sg.GenreId = g.GenreId JOIN dbo.Story s ON s.StoryId = sg.StoryId "
        "WHERE s.PublishStatus = 'PUBLISHED' AND s.IsDeleted = 0 "
        "GROUP BY g.GenreId, g.Slug, g.Name ORDER BY COUNT(*) DESC, g.GenreId")[0]


def view_window(ctx: Ctx, days: int = 30) -> tuple:
    """(first day, day after the last day) of the last `days` days of dbo.StoryViewDaily."""
    last = ctx.sql.scalar("SELECT MAX(ViewDate) FROM dbo.StoryViewDaily")
    from datetime import timedelta
    return last - timedelta(days=days - 1), last + timedelta(days=1)
