"""Redis side of the example topic. Data is copied from dbo.Story before measuring.

Keys (namespace lab:example:, deleted automatically after the topic):
  story:{id}   Hash   fields of one story
  story:rating Sorted set  member = StoryId, score = RatingAvg
"""
from lab.framework import Ctx, scenario

LOAD_SQL = """
SELECT StoryId, Title, Slug, CompletionStatus, ChapterCount, ViewCount, RatingAvg, RatingCount
FROM dbo.Story WHERE PublishStatus = 'PUBLISHED' AND IsDeleted = 0
"""


def load_stories(ctx: Ctx) -> list[dict]:
    """Copy published stories from SQL Server into Redis (not timed)."""
    rows = ctx.sql.query(LOAD_SQL)
    r = ctx.redis
    pipe = r.pipeline(transaction=False)
    for row in rows:
        pipe.hset(r.key("story", row["StoryId"]),
                  mapping={k: "" if v is None else str(v) for k, v in row.items()})
        pipe.zadd(r.key("story", "rating"), {str(row["StoryId"]): float(row["RatingAvg"])})
    pipe.execute()
    return rows


@scenario(title="Lấy 1 truyện theo StoryId", pair="story_by_id")
def story_by_id(ctx: Ctx):
    rows = load_stories(ctx)
    story_id = min(r["StoryId"] for r in rows)
    key = ctx.redis.key("story", story_id)

    stats = ctx.bench_redis("hgetall", lambda r: r.hgetall(key))

    ctx.check(ctx.redis.hget(key, "StoryId") == str(story_id), f"Hash của StoryId={story_id} tồn tại")
    ctx.observe(f"HGETALL trên 1 key: p50 {stats.p50:.3f} ms phía server (O(số field)).")


@scenario(title="Top 10 truyện rating cao nhất", pair="top_rated")
def top_rated(ctx: Ctx):
    load_stories(ctx)
    zkey = ctx.redis.key("story", "rating")

    def top10(r):
        ids = r.zrevrange(zkey, 0, 9)
        pipe = r.pipeline(transaction=False)
        for story_id in ids:
            pipe.hget(r.key("story", story_id), "Title")
        return pipe.execute()

    ctx.bench_redis("zrevrange_plus_titles", top10)

    ctx.check(len(top10(ctx.redis)) == 10, "trả về 10 truyện")
    ctx.observe("Sorted set đã sắp sẵn theo score, ZREVRANGE là O(log N + 10); thêm 10 HGET để lấy tên truyện.")
